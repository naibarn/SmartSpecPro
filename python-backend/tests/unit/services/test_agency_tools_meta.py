from __future__ import annotations

import httpx
import pytest
from types import SimpleNamespace

from app.services.agency_tools import (
    _BUILTIN_ENDPOINTS,
    _BUILTIN_RISK_LEVELS,
    _execute_http,
    resolve_tools_for_agent,
    ToolConfig,
)


def test_builtin_meta_channels_is_registered() -> None:
    assert _BUILTIN_ENDPOINTS["builtin-meta-channels"] == "/api/internal/tools/meta-channels"
    assert _BUILTIN_RISK_LEVELS["builtin-meta-channels"] == "medium"


def test_builtin_social_actions_is_registered() -> None:
    assert _BUILTIN_ENDPOINTS["builtin-social-actions"] == "/api/internal/tools/social-actions"
    assert _BUILTIN_RISK_LEVELS["builtin-social-actions"] == "medium"


def test_http_bridge_adds_agent_and_tool_headers(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeClient:
        def __init__(self, timeout):
            self.timeout = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def request(self, method, url, **kwargs):
            captured["method"] = method
            captured["url"] = url
            captured["kwargs"] = kwargs
            return httpx.Response(200, content=b"ok", request=httpx.Request(method, url))

    monkeypatch.setattr("app.services.agency_tools.httpx.Client", FakeClient)

    result = _execute_http(
        ToolConfig(
            tool_id="builtin-meta-channels",
            tool_type="builtin",
            risk_level="medium",
            requires_approval=False,
            endpoint_url="https://example.com/api/internal/tools/meta-channels",
            config={"agentId": "agent-7"},
        ),
        {"action": "read_inbox"},
    )

    assert result == "ok"
    assert captured["method"] == "POST"
    assert captured["url"] == "https://example.com/api/internal/tools/meta-channels"
    headers = captured["kwargs"]["headers"]
    assert headers["X-Agent-Tool-Id"] == "builtin-meta-channels"
    assert headers["X-Agent-Id"] == "agent-7"
    assert captured["kwargs"]["json"] == {
        "query": {"action": "read_inbox"},
        "agentId": "agent-7",
    }


@pytest.mark.asyncio
async def test_resolve_tools_for_agent_injects_tenant_id_for_social_actions(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeResult:
        def __init__(self, rows):
            self._rows = rows

        def all(self):
            return self._rows

        def first(self):
            return None

    class FakeDb:
        async def execute(self, query, params):
            if "agency_agent_tools" in str(query):
                return FakeResult(
                    [
                        SimpleNamespace(
                            tool_id="builtin-social-actions",
                            tool_type="builtin",
                            risk_level="medium",
                            requires_approval=False,
                            base_config={},
                            instance_config={},
                        )
                    ]
                )
            return FakeResult([])

    def fake_create_tool_bridge(tool_config, whitelist, **kwargs):
        captured["tool_config"] = tool_config
        return type("FakeTool", (), {})

    monkeypatch.setattr("app.services.agency_tools.create_tool_bridge", fake_create_tool_bridge)

    tools = await resolve_tools_for_agent(
        FakeDb(),
        "agent-42",
        {"builtin-social-actions"},
        run_context=SimpleNamespace(
            get_sync=lambda key: "tenant-99" if key in {"tenant_id", "tenantId"} else None,
        ),
    )

    assert len(tools) == 1
    tool_config = captured["tool_config"]
    assert isinstance(tool_config, ToolConfig)
    assert tool_config.tool_id == "builtin-social-actions"
    assert tool_config.config["agentId"] == "agent-42"
    assert tool_config.config["tenantId"] == "tenant-99"
