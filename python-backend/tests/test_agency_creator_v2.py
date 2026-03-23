"""Tests for AI Creator v2 — 10-phase pipeline with PLAN, REVIEW_PLAN, REVIEW_DESIGN."""

import json

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.tasks.agency_creator_task import (
    _fallback_plan,
    _llm_discover,
    _llm_plan,
    _llm_review_plan,
    _llm_review_design,
    _validate_spec,
    _safe_json_parse,
    MAX_DISCOVER_CALLS,
)


@pytest.mark.unit
@pytest.mark.agency
class TestLlmDiscover:
    @pytest.mark.asyncio
    async def test_discover_returns_capability_fields(self):
        discover_response = json.dumps({
            "is_clear": True,
            "domain": "content_creation",
            "estimated_agents": 3,
            "questions": [],
            "notes": "Content pipeline",
            "recommended_capabilities": {
                "web_search": True,
                "thinking": True,
                "vision": False,
                "code_execution": False,
                "computer_use": False,
            },
            "complexity_level": "moderate",
            "memory_recommendation": True,
            "domain_insights": "Content workflows benefit from web research",
        })

        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = discover_response
            result = await _llm_discover("Create a content marketing team", "gpt-4o", 1)

        assert "recommended_capabilities" in result
        caps = result["recommended_capabilities"]
        assert isinstance(caps, dict)
        for key in ("web_search", "thinking", "vision", "code_execution", "computer_use"):
            assert key in caps
        assert result["complexity_level"] in ("simple", "moderate", "complex")
        assert isinstance(result["memory_recommendation"], bool)
        assert "domain_insights" in result

    @pytest.mark.asyncio
    async def test_discover_fallback_has_capability_fields(self):
        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = None
            result = await _llm_discover("test requirement", "gpt-4o", 1)

        assert result["is_clear"] is True
        assert "recommended_capabilities" in result
        caps = result["recommended_capabilities"]
        assert all(caps[k] is False for k in ("web_search", "thinking", "vision", "code_execution", "computer_use"))
        assert result["complexity_level"] == "moderate"
        assert result["memory_recommendation"] is True

    @pytest.mark.asyncio
    async def test_discover_budget_cap_retries_on_parse_failure(self):
        """MAX_DISCOVER_CALLS limits retries when LLM returns unparseable JSON."""
        valid_response = json.dumps({
            "is_clear": True, "domain": "general", "estimated_agents": 2, "questions": [],
            "notes": "", "recommended_capabilities": {
                "web_search": False, "thinking": False, "vision": False,
                "code_execution": False, "computer_use": False,
            },
            "complexity_level": "simple", "memory_recommendation": False, "domain_insights": "",
        })

        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
            # First call returns garbage, second returns valid JSON
            mock_call.side_effect = ["NOT VALID JSON {{{{", valid_response]
            result = await _llm_discover("test", "gpt-4o", 1)

        assert mock_call.call_count == 2
        assert mock_call.call_count <= MAX_DISCOVER_CALLS
        assert result["is_clear"] is True

    @pytest.mark.asyncio
    async def test_discover_budget_cap_falls_back_after_max_retries(self):
        """Falls back when all attempts return unparseable JSON."""
        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = "NOT VALID JSON"
            result = await _llm_discover("test", "gpt-4o", 1)

        assert mock_call.call_count == MAX_DISCOVER_CALLS
        # Should return fallback
        assert result["is_clear"] is True
        assert result["domain"] == "general"

    @pytest.mark.asyncio
    async def test_discover_no_technical_questions(self):
        discover_response = json.dumps({
            "is_clear": False,
            "domain": "general",
            "estimated_agents": 2,
            "questions": [
                {"id": "q1", "question": "Who is the target audience?", "type": "text"},
            ],
            "notes": "Need more info",
            "recommended_capabilities": {
                "web_search": False, "thinking": False, "vision": False,
                "code_execution": False, "computer_use": False,
            },
            "complexity_level": "simple",
            "memory_recommendation": False,
            "domain_insights": "",
        })

        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = discover_response
            result = await _llm_discover("Build an agency", "gpt-4o", 1)

        mock_call.assert_called_once()
        system_prompt = mock_call.call_args.kwargs["system_prompt"]
        assert "Do NOT ask technical questions" in system_prompt


@pytest.mark.unit
@pytest.mark.agency
class TestValidateSpecComputerUseGuardrail:
    def test_computer_use_stripped_when_present(self):
        spec = {
            "nodes": [
                {
                    "id": "n1", "nodeType": "agent", "isEntryPoint": True,
                    "name": "Browser Agent",
                    "modelRequirements": {"supportsComputerUse": True, "supportsFunctionTools": True},
                    "nodeConfig": {},
                },
            ],
            "edges": [],
        }
        result = _validate_spec(spec)
        agent = result["nodes"][0]
        # Without feature flag enabled, computer_use should be stripped
        assert agent["modelRequirements"]["supportsComputerUse"] is False

    def test_computer_use_not_stripped_when_absent(self):
        spec = {
            "nodes": [
                {
                    "id": "n1", "nodeType": "agent", "isEntryPoint": True,
                    "name": "Normal Agent",
                    "modelRequirements": {"supportsFunctionTools": True},
                    "nodeConfig": {},
                },
            ],
            "edges": [],
        }
        result = _validate_spec(spec)
        agent = result["nodes"][0]
        assert agent["modelRequirements"].get("supportsComputerUse") is None


@pytest.mark.unit
@pytest.mark.agency
class TestLlmPlan:
    @pytest.mark.asyncio
    async def test_plan_generates_plan_steps_with_valid_node_types(self):
        valid_types = {
            "agent", "supervisor", "router", "aggregator",
            "knowledge_base", "skill_call", "human_approval", "browser_session",
            "conditional_branch", "parallel_fan_out", "loop_retry", "skill_discovery",
            "data_transform", "error_handler",
        }
        plan_response = json.dumps({
            "topology": "hybrid",
            "planSteps": [
                {"nodeType": "supervisor", "name": "Coordinator", "purpose": "Coordinates", "connections": ["Worker"]},
                {"nodeType": "agent", "name": "Worker", "purpose": "Does work", "connections": []},
                {"nodeType": "conditional_branch", "name": "Router", "purpose": "Routes", "connections": []},
            ],
            "rationale": "Test plan",
        })

        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = plan_response
            result = await _llm_plan("test requirement", {}, {}, [], "gpt-4o", 1)

        assert "planSteps" in result
        for step in result["planSteps"]:
            assert step["nodeType"] in valid_types

    @pytest.mark.asyncio
    async def test_plan_fallback_on_llm_failure(self):
        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = None
            result = await _llm_plan("test", {}, {}, [], "gpt-4o", 1)

        assert "planSteps" in result
        assert len(result["planSteps"]) >= 2


@pytest.mark.unit
@pytest.mark.agency
class TestLlmReviewPlan:
    @pytest.mark.asyncio
    async def test_review_plan_catches_issues(self):
        review_response = json.dumps({
            "verdict": "needs_fix",
            "issues": ["no error handler for critical agent"],
            "fixedPlan": {"planSteps": [{"nodeType": "agent", "name": "Fixed"}]},
        })

        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = review_response
            result = await _llm_review_plan({"planSteps": []}, "gpt-4o", 1)

        assert result["verdict"] == "needs_fix"
        assert len(result["issues"]) > 0

    @pytest.mark.asyncio
    async def test_review_plan_passes_clean_plan(self):
        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = json.dumps({"verdict": "pass"})
            result = await _llm_review_plan({"planSteps": []}, "gpt-4o", 1)

        assert result["verdict"] == "pass"
        assert mock_call.call_count == 1


@pytest.mark.unit
@pytest.mark.agency
class TestLlmReviewDesign:
    @pytest.mark.asyncio
    async def test_review_design_catches_orphan_nodes(self):
        review_response = json.dumps({
            "verdict": "needs_fix",
            "issues": ["node-5 is orphaned"],
            "fixedSpec": {"nodes": [], "edges": []},
        })

        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = review_response
            result = await _llm_review_design({"nodes": [], "edges": []}, "gpt-4o", 1)

        assert result["verdict"] == "needs_fix"
        assert any("orphan" in issue.lower() for issue in result["issues"])


@pytest.mark.unit
@pytest.mark.agency
class TestValidateSpecV2:
    def test_conditional_branch_gets_default_target(self):
        spec = {
            "nodes": [
                {"id": "n1", "nodeType": "agent", "isEntryPoint": True, "name": "Agent"},
                {"id": "n2", "nodeType": "conditional_branch", "name": "Branch", "nodeConfig": {}},
            ],
            "edges": [{"fromNodeId": "n1", "toNodeId": "n2"}],
        }
        result = _validate_spec(spec)
        branch = next(n for n in result["nodes"] if n["nodeType"] == "conditional_branch")
        assert branch["nodeConfig"].get("defaultTargetNodeId") is not None

    def test_loop_retry_clamps_max_iterations(self):
        spec = {
            "nodes": [
                {"id": "n1", "nodeType": "agent", "isEntryPoint": True, "name": "Agent"},
                {"id": "n2", "nodeType": "loop_retry", "name": "Loop", "nodeConfig": {
                    "exitCondition": {"mode": "max_iterations", "maxIterations": 50},
                }},
            ],
            "edges": [],
        }
        result = _validate_spec(spec)
        loop = next(n for n in result["nodes"] if n["nodeType"] == "loop_retry")
        assert loop["nodeConfig"]["exitCondition"]["maxIterations"] <= 20

    def test_parallel_fan_out_ensures_min_branches(self):
        spec = {
            "nodes": [
                {"id": "n1", "nodeType": "agent", "isEntryPoint": True, "name": "Agent"},
                {"id": "n2", "nodeType": "parallel_fan_out", "name": "Fan Out", "nodeConfig": {
                    "branches": [{"targetNodeId": "n1", "label": "Branch 1"}],
                }},
            ],
            "edges": [],
        }
        result = _validate_spec(spec)
        fan_out = next(n for n in result["nodes"] if n["nodeType"] == "parallel_fan_out")
        assert len(fan_out["nodeConfig"]["branches"]) >= 2
        assert fan_out["nodeConfig"]["mergeStrategy"] == "wait_all"

    def test_error_handler_clamps_max_retries(self):
        spec = {
            "nodes": [
                {"id": "n1", "nodeType": "agent", "isEntryPoint": True, "name": "Agent"},
                {"id": "n2", "nodeType": "error_handler", "name": "Handler", "nodeConfig": {
                    "watchedNodeIds": ["n1"],
                    "retryConfig": {"maxRetries": 10},
                }},
            ],
            "edges": [],
        }
        result = _validate_spec(spec)
        handler = next(n for n in result["nodes"] if n["nodeType"] == "error_handler")
        assert handler["nodeConfig"]["retryConfig"]["maxRetries"] <= 5

    def test_skill_discovery_gets_defaults(self):
        spec = {
            "nodes": [
                {"id": "n1", "nodeType": "agent", "isEntryPoint": True, "name": "Agent"},
                {"id": "n2", "nodeType": "skill_discovery", "name": "Discover", "nodeConfig": {}},
            ],
            "edges": [],
        }
        result = _validate_spec(spec)
        sd = next(n for n in result["nodes"] if n["nodeType"] == "skill_discovery")
        assert sd["nodeConfig"]["confidenceThreshold"] == 0.7
        assert sd["nodeConfig"]["maxResults"] == 5

    def test_data_transform_gets_defaults(self):
        spec = {
            "nodes": [
                {"id": "n1", "nodeType": "agent", "isEntryPoint": True, "name": "Agent"},
                {"id": "n2", "nodeType": "data_transform", "name": "Transform", "nodeConfig": {}},
            ],
            "edges": [],
        }
        result = _validate_spec(spec)
        dt = next(n for n in result["nodes"] if n["nodeType"] == "data_transform")
        assert dt["nodeConfig"]["transformMode"] == "jsonpath"
        assert dt["nodeConfig"]["outputKey"] == "transform_result"

    def test_non_tool_nodes_stripped_of_tool_ids(self):
        spec = {
            "nodes": [
                {"id": "n1", "nodeType": "agent", "isEntryPoint": True, "name": "Agent",
                 "toolIds": ["builtin-web-search"]},
                {"id": "n2", "nodeType": "skill_call", "name": "Skill",
                 "toolIds": ["builtin-web-search"], "nodeConfig": {}},
            ],
            "edges": [],
        }
        result = _validate_spec(spec)
        agent = next(n for n in result["nodes"] if n["nodeType"] == "agent")
        skill = next(n for n in result["nodes"] if n["nodeType"] == "skill_call")
        assert len(agent["toolIds"]) > 0  # Agent keeps tools
        assert len(skill["toolIds"]) == 0  # skill_call stripped


@pytest.mark.unit
@pytest.mark.agency
class TestFallbackPlan:
    def test_fallback_returns_valid_plan(self):
        plan = _fallback_plan("test requirement", {})
        assert "planSteps" in plan
        assert len(plan["planSteps"]) >= 2
        types = {s["nodeType"] for s in plan["planSteps"]}
        assert "supervisor" in types or "agent" in types
