"""Unit tests for agency skill input mapper — resolve field-level input mappings."""

import pytest

from app.services.agency_run_context import AgencyRunContext
from app.services.agency_skill_input_mapper import resolve_skill_input_mappings


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_resolve_static_values_unchanged():
    """Static source returns value directly."""
    mappings = {"title": {"source": "static", "value": "Hello"}}
    ctx = AgencyRunContext()
    result = await resolve_skill_input_mappings(mappings, ctx, {})
    assert result == {"title": "Hello"}


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_resolve_node_output_references():
    """node_output source looks up results dict by nodeId and outputField."""
    mappings = {
        "content": {
            "source": "node_output",
            "nodeId": "node-1",
            "outputField": "result",
        }
    }
    results = {"node-1": {"result": "Generated text"}}
    ctx = AgencyRunContext()
    result = await resolve_skill_input_mappings(mappings, ctx, results)
    assert result == {"content": "Generated text"}


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_resolve_context_keys():
    """context source reads from AgencyRunContext."""
    mappings = {"lang": {"source": "context", "contextKey": "user_language"}}
    ctx = AgencyRunContext({"user_language": "en"})
    result = await resolve_skill_input_mappings(mappings, ctx, {})
    assert result == {"lang": "en"}


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_backward_compatible_no_mappings():
    """When mappings is None or empty, returns None (caller uses existing behavior)."""
    ctx = AgencyRunContext()
    assert await resolve_skill_input_mappings(None, ctx, {}) is None
    assert await resolve_skill_input_mappings({}, ctx, {}) is None


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_missing_node_output_returns_none():
    """Missing node output reference returns None gracefully."""
    mappings = {
        "field": {
            "source": "node_output",
            "nodeId": "node-99",
            "outputField": "result",
        }
    }
    ctx = AgencyRunContext()
    result = await resolve_skill_input_mappings(mappings, ctx, {})
    assert result == {"field": None}


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_missing_context_key_returns_none():
    """Missing context key returns None gracefully."""
    mappings = {"field": {"source": "context", "contextKey": "nonexistent"}}
    ctx = AgencyRunContext()
    result = await resolve_skill_input_mappings(mappings, ctx, {})
    assert result == {"field": None}


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_mixed_mapping_sources():
    """Multiple fields with different sources all resolve correctly."""
    mappings = {
        "title": {"source": "static", "value": "My Title"},
        "content": {
            "source": "node_output",
            "nodeId": "node-1",
            "outputField": "text",
        },
        "lang": {"source": "context", "contextKey": "language"},
    }
    results = {"node-1": {"text": "From node"}}
    ctx = AgencyRunContext({"language": "th"})
    result = await resolve_skill_input_mappings(mappings, ctx, results)
    assert result == {
        "title": "My Title",
        "content": "From node",
        "lang": "th",
    }


@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_nested_dot_path_navigation():
    """node_output with dot-path outputField traverses nested dicts."""
    mappings = {
        "data": {
            "source": "node_output",
            "nodeId": "node-1",
            "outputField": "outputs.result.text",
        }
    }
    results = {"node-1": {"outputs": {"result": {"text": "Deep value"}}}}
    ctx = AgencyRunContext()
    result = await resolve_skill_input_mappings(mappings, ctx, results)
    assert result == {"data": "Deep value"}
