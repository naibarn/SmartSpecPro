"""Unit tests for agency skill discovery node handler."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.agency_run_context import AgencyRunContext
from app.services.agency_skill_discovery import execute_skill_discovery


def _make_discovery_response(skills: list[dict]) -> dict:
    return {"skills": skills}


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_discovery_returns_ranked_skills():
    """Skill discovery returns ranked list from endpoint."""
    mock_skills = [
        {"id": "img-gen", "name": "Image Generator", "confidence": 0.9},
        {"id": "vid-gen", "name": "Video Generator", "confidence": 0.7},
    ]
    ctx = AgencyRunContext()
    results: dict = {}
    node_config = {
        "taskSource": "static",
        "taskValue": "generate product image",
        "confidenceThreshold": 0.5,
        "maxResults": 5,
    }

    with patch("app.services.agency_skill_discovery.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = _make_discovery_response(mock_skills)
        mock_client.post.return_value = mock_resp

        output = await execute_skill_discovery(
            node_name="discover_1", node_config=node_config, context=ctx, results=results
        )

    assert "Image Generator" in output
    discovered = await ctx.get("discover_1_discovered")
    assert len(discovered) == 2


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_discovery_filters_by_confidence_threshold():
    """Skills below confidenceThreshold are filtered out."""
    mock_skills = [
        {"id": "s1", "name": "Skill A", "confidence": 0.9},
        {"id": "s2", "name": "Skill B", "confidence": 0.6},
        {"id": "s3", "name": "Skill C", "confidence": 0.3},
    ]
    ctx = AgencyRunContext()
    node_config = {
        "taskSource": "static",
        "taskValue": "test",
        "confidenceThreshold": 0.7,
        "maxResults": 10,
    }

    with patch("app.services.agency_skill_discovery.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = _make_discovery_response(mock_skills)
        mock_client.post.return_value = mock_resp

        output = await execute_skill_discovery(
            node_name="disc", node_config=node_config, context=ctx, results={}
        )

    discovered = await ctx.get("disc_discovered")
    assert len(discovered) == 1
    assert discovered[0]["id"] == "s1"


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_discovery_caps_max_results():
    """maxResults is capped at 10 server-side."""
    ctx = AgencyRunContext()
    node_config = {
        "taskSource": "static",
        "taskValue": "test",
        "confidenceThreshold": 0.0,
        "maxResults": 50,
    }

    with patch("app.services.agency_skill_discovery.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = _make_discovery_response([])
        mock_client.post.return_value = mock_resp

        await execute_skill_discovery(
            node_name="disc", node_config=node_config, context=ctx, results={}
        )

    # Verify the request used capped limit
    call_kwargs = mock_client.post.call_args
    request_json = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
    assert request_json["limit"] <= 10


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_discovery_stores_in_context():
    """Discovery results stored in context under '{nodeName}_discovered'."""
    mock_skills = [{"id": "s1", "name": "Skill A", "confidence": 0.9}]
    ctx = AgencyRunContext()
    node_config = {
        "taskSource": "static",
        "taskValue": "test",
        "confidenceThreshold": 0.5,
        "maxResults": 5,
    }

    with patch("app.services.agency_skill_discovery.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = _make_discovery_response(mock_skills)
        mock_client.post.return_value = mock_resp

        await execute_skill_discovery(
            node_name="my_node", node_config=node_config, context=ctx, results={}
        )

    stored = await ctx.get("my_node_discovered")
    assert stored is not None
    assert len(stored) == 1
    assert stored[0]["name"] == "Skill A"


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_discovery_with_category_filter():
    """Category filter is passed to the discovery endpoint."""
    ctx = AgencyRunContext()
    node_config = {
        "taskSource": "static",
        "taskValue": "test",
        "confidenceThreshold": 0.5,
        "maxResults": 5,
        "skillCategories": ["image_generation"],
    }

    with patch("app.services.agency_skill_discovery.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = _make_discovery_response([])
        mock_client.post.return_value = mock_resp

        await execute_skill_discovery(
            node_name="disc", node_config=node_config, context=ctx, results={}
        )

    call_kwargs = mock_client.post.call_args
    request_json = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
    assert request_json.get("category") == "image_generation"


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_discovery_merges_multiple_categories_without_duplicates():
    """Multi-category filters fan out into multiple requests and dedupe results."""
    ctx = AgencyRunContext()
    node_config = {
        "taskSource": "static",
        "taskValue": "make promotional media",
        "confidenceThreshold": 0.5,
        "maxResults": 5,
        "skillCategories": ["image_generation", "video_generation"],
    }

    with patch("app.services.agency_skill_discovery.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        first_response = MagicMock()
        first_response.status_code = 200
        first_response.json.return_value = _make_discovery_response([
            {"id": "shared", "name": "Shared Skill", "confidence": 0.7},
            {"id": "image-only", "name": "Image Skill", "confidence": 0.9},
        ])
        second_response = MagicMock()
        second_response.status_code = 200
        second_response.json.return_value = _make_discovery_response([
            {"id": "shared", "name": "Shared Skill", "confidence": 0.8},
            {"id": "video-only", "name": "Video Skill", "confidence": 0.6},
        ])
        mock_client.post.side_effect = [first_response, second_response]

        output = await execute_skill_discovery(
            node_name="disc", node_config=node_config, context=ctx, results={}
        )

    assert mock_client.post.call_count == 2
    discovered = await ctx.get("disc_discovered")
    assert [skill["id"] for skill in discovered] == ["image-only", "shared", "video-only"]
    assert "Discovered 3 skills" in output


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_discovery_no_matches_returns_empty():
    """No matching skills returns empty list, not an error."""
    ctx = AgencyRunContext()
    node_config = {
        "taskSource": "static",
        "taskValue": "obscure task",
        "confidenceThreshold": 0.9,
        "maxResults": 5,
    }

    with patch("app.services.agency_skill_discovery.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = _make_discovery_response([])
        mock_client.post.return_value = mock_resp

        output = await execute_skill_discovery(
            node_name="disc", node_config=node_config, context=ctx, results={}
        )

    discovered = await ctx.get("disc_discovered")
    assert discovered == []
    assert "no_match" in output.lower() or "0 skills" in output.lower()


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_discovery_context_task_source():
    """taskSource='context' reads task from context key."""
    ctx = AgencyRunContext({"task_description": "create a banner"})
    node_config = {
        "taskSource": "context",
        "contextKey": "task_description",
        "confidenceThreshold": 0.5,
        "maxResults": 5,
    }

    with patch("app.services.agency_skill_discovery.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = _make_discovery_response([])
        mock_client.post.return_value = mock_resp

        await execute_skill_discovery(
            node_name="disc", node_config=node_config, context=ctx, results={}
        )

    call_kwargs = mock_client.post.call_args
    request_json = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
    assert request_json["description"] == "create a banner"


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_discovery_previous_output_task_source():
    """taskSource='previous_output' uses last node result as task description."""
    ctx = AgencyRunContext()
    results = {"node-1": "analyze the dataset", "node-2": "generate a chart"}
    node_config = {
        "taskSource": "previous_output",
        "confidenceThreshold": 0.5,
        "maxResults": 5,
    }

    with patch("app.services.agency_skill_discovery.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = _make_discovery_response([])
        mock_client.post.return_value = mock_resp

        await execute_skill_discovery(
            node_name="disc", node_config=node_config, context=ctx, results=results
        )

    call_kwargs = mock_client.post.call_args
    request_json = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
    assert request_json["description"] == "generate a chart"
