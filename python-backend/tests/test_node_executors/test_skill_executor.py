"""Tests for SkillExecutor real skill discovery/execution path."""
from __future__ import annotations

import pytest

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.skill_executor import (
    SkillExecutor,
    discover_available_skills,
)


@pytest.mark.asyncio
async def test_skill_executor_loads_apps_web_skill(tmp_path):
    """Executor should load skill and execute through LLM gateway path."""
    skill_dir = tmp_path / "apps" / "web" / "skills" / "demo-skill"
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "skill.md").write_text(
        "---\nname: Demo Skill\ndescription: Demo description\ncategory: test\nversion: '1.2.3'\n---\n\n# Demo\n",
        encoding="utf-8",
    )

    executor = SkillExecutor()
    async def _fake_llm_gateway(**kwargs):
        return "Demo result", {
            "prompt_tokens": 10,
            "completion_tokens": 20,
            "total_tokens": 30,
            "creditsUsed": 1,
            "model": "gpt-4o-mini",
        }
    executor._call_llm_gateway = _fake_llm_gateway

    data = NodeExecutionData(
        node_id="node-1",
        node_type="skill",
        config={"skill_id": "demo-skill"},
        inputs={"input_data": {"text": "hello"}},
        state={},
    )
    context = ExecutionContext(
        user_id=1,
        tenant_id="tenant-1",
        workflow_id="wf-1",
        execution_id="exec-1",
        extra_data={
            "workspace_root": str(tmp_path),
            "user_token": "test-token",
        },
    )

    result = await executor.execute(data, context)
    assert result["outputs"]["status"] == "success"
    assert result["skill_id"] == "demo-skill"
    assert result["skill_version"] == "1.2.3"
    assert result["outputs"]["result"] == "Demo result"


@pytest.mark.asyncio
async def test_skill_executor_requires_auth_token(tmp_path):
    """Executor should not return mock success when auth token is missing."""
    skill_dir = tmp_path / "apps" / "web" / "skills" / "demo-skill"
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "skill.md").write_text(
        "---\nname: Demo Skill\ndescription: Demo description\ncategory: test\nversion: '1.2.3'\n---\n\n# Demo\n",
        encoding="utf-8",
    )

    executor = SkillExecutor()
    data = NodeExecutionData(
        node_id="node-1",
        node_type="skill",
        config={"skill_id": "demo-skill"},
        inputs={"input_data": {"text": "hello"}},
        state={},
    )
    context = ExecutionContext(
        user_id=1,
        tenant_id="tenant-1",
        workflow_id="wf-1",
        execution_id="exec-1",
        extra_data={"workspace_root": str(tmp_path)},
    )

    result = await executor.execute(data, context)
    assert result["outputs"]["status"] == "error"
    assert "No authentication token" in result["error"]


def test_discover_available_skills_reads_apps_web(tmp_path):
    """Discovery should list skills from apps/web/skills."""
    skill_dir = tmp_path / "apps" / "web" / "skills" / "translate-fast"
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "skill.md").write_text(
        "---\nname: Translate Fast\ndescription: Translate text quickly\ncategory: translation\n---\n\nSkill body\n",
        encoding="utf-8",
    )

    skills = discover_available_skills(tmp_path)
    by_id = {s["id"]: s for s in skills}

    assert "translate-fast" in by_id
    assert by_id["translate-fast"]["name"] == "Translate Fast"
    assert by_id["translate-fast"]["category"] == "translation"
