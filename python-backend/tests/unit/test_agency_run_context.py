"""
Tests for AgencyRunContext — shared mutable state for agency runs.
"""

import asyncio
import copy

import pytest

from app.services.agency_run_context import AgencyRunContext


# ── Test 1: get returns default when key missing ─────────────────────

@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_get_returns_default_when_key_missing():
    ctx = AgencyRunContext()
    result = await ctx.get("nonexistent")
    assert result is None

    result2 = await ctx.get("missing", "fallback")
    assert result2 == "fallback"


# ── Test 2: set stores value retrievable by get ──────────────────────

@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_set_stores_value_retrievable_by_get():
    ctx = AgencyRunContext()
    await ctx.set("key1", "value1")
    assert await ctx.get("key1") == "value1"

    await ctx.set("key1", "updated")
    assert await ctx.get("key1") == "updated"


# ── Test 3: get_all returns full snapshot dict ───────────────────────

@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_get_all_returns_full_snapshot():
    ctx = AgencyRunContext()
    await ctx.set("a", 1)
    await ctx.set("b", 2)
    all_data = await ctx.get_all()
    assert all_data == {"a": 1, "b": 2}
    # Should be a copy, not a reference
    all_data["c"] = 3
    assert await ctx.get("c") is None


# ── Test 4: concurrent read/write does not corrupt data ──────────────

@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_concurrent_read_write_no_corruption():
    ctx = AgencyRunContext()

    async def write_key(i: int):
        await ctx.set(f"key_{i}", i)

    tasks = [write_key(i) for i in range(50)]
    await asyncio.gather(*tasks)

    all_data = await ctx.get_all()
    assert len(all_data) == 50
    for i in range(50):
        assert all_data[f"key_{i}"] == i


# ── Test 5: initialized with user_context seed data ──────────────────

@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_initialized_with_seed_data():
    ctx = AgencyRunContext(initial_data={"project": "Alpha", "lang": "en"})
    assert await ctx.get("project") == "Alpha"
    assert await ctx.get("lang") == "en"


# ── Test 6: snapshot returns frozen copy ──────────────────────────────

@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_snapshot_returns_frozen_copy():
    ctx = AgencyRunContext(initial_data={"items": [1, 2, 3]})
    snap = ctx.snapshot()
    assert snap == {"items": [1, 2, 3]}

    # Mutations after snapshot don't affect it
    await ctx.set("items", [4, 5, 6])
    assert snap == {"items": [1, 2, 3]}

    # Mutating the snapshot doesn't affect context
    snap["items"].append(99)
    assert await ctx.get("items") == [4, 5, 6]


# ── Test 7: run-scoped isolation ─────────────────────────────────────

@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_run_scoped_isolation():
    ctx1 = AgencyRunContext()
    ctx2 = AgencyRunContext()
    await ctx1.set("shared_key", "run1_value")
    await ctx2.set("shared_key", "run2_value")
    assert await ctx1.get("shared_key") == "run1_value"
    assert await ctx2.get("shared_key") == "run2_value"


# ── Test 8: ToolBridge receives context reference ────────────────────

@pytest.mark.unit
@pytest.mark.agency
def test_tool_bridge_receives_context():
    from app.services.agency_tools import _make_run_func, ToolConfig

    ctx = AgencyRunContext(initial_data={"seed": "value"})
    config = ToolConfig(
        tool_id="builtin-rag-knowledge",
        tool_type="builtin",
        risk_level="low",
        requires_approval=False,
        endpoint_url="http://127.0.0.1:3000/api/internal/tools/rag-knowledge",
    )
    run_func = _make_run_func(config, whitelist={"builtin-rag-knowledge"}, run_context=ctx)

    # Create a mock tool instance
    class MockTool:
        query = "test"

    tool = MockTool()
    # run_func will attach context and then try HTTP call (which will fail),
    # but we can verify context was attached
    run_func(tool)
    assert tool.context is ctx
    assert tool.context.get_sync("seed") == "value"


# ── Test 9: ExecutionContext gets shared_context from orchestrator ────

@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_execution_context_has_shared_context():
    from app.services.agency_orchestrator import ExecutionContext

    exec_ctx = ExecutionContext(
        input_message="test",
        user_token="tok",
        tenant_id="t1",
    )
    # shared_context should default to None
    assert exec_ctx.shared_context is None

    # Can be assigned
    run_ctx = AgencyRunContext(initial_data={"seed": True})
    exec_ctx.shared_context = run_ctx
    assert await exec_ctx.shared_context.get("seed") is True


# ── Test 10: orchestrator persists context snapshot at run end ────────

@pytest.mark.unit
@pytest.mark.agency
@pytest.mark.asyncio
async def test_orchestrator_persists_context_snapshot():
    from app.services.agency_orchestrator import AgencyOrchestrator

    # Create a minimal single-node agency that doesn't need adapter
    nodes = [
        {
            "id": "node1",
            "name": "TestAgent",
            "node_type": "knowledge_base",
            "is_entry_point": True,
            "node_config": {},
        }
    ]
    edges: list = []

    orchestrator = AgencyOrchestrator(
        nodes=nodes,
        edges=edges,
        adapter=None,
        db=None,
        user_context={"project": "test_proj"},
    )

    result, ctx = await orchestrator.run_with_context(
        message="hello",
        user_token="tok",
        tenant_id="t1",
    )

    # shared_context should have been created with seed data
    assert ctx.shared_context is not None
    assert await ctx.shared_context.get("project") == "test_proj"

    # context_snapshot should be populated
    assert ctx.context_snapshot is not None
    assert ctx.context_snapshot["project"] == "test_proj"
