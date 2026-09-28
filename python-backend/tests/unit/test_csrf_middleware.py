"""Regression tests for server-to-server CSRF exemptions."""

import asyncio

import pytest
from fastapi import HTTPException
from starlette.requests import Request
from starlette.responses import PlainTextResponse

from app.core.csrf import CSRFMiddleware


def _request(path: str, method: str = "POST") -> Request:
    return Request(
        {
            "type": "http",
            "method": method,
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "headers": [],
            "client": ("testclient", 50000),
            "server": ("testserver", 80),
            "scheme": "http",
        }
    )


async def _next(_request: Request) -> PlainTextResponse:
    return PlainTextResponse("ok")


@pytest.mark.parametrize(
    "path",
    [
        "/api/admin/vectordb/provider-switch/assert-config-edit",
        "/api/admin/vectordb/provider-switch/request",
        "/api/admin/vectordb/provider-switch/approve",
        "/api/admin/vectordb/backfill/campaign",
        "/api/admin/vectordb/backfill/campaign/batch",
        "/api/admin/vectordb/reindex",
    ],
)
def test_vector_db_admin_bridge_paths_bypass_browser_csrf(path: str):
    middleware = CSRFMiddleware(lambda *_args, **_kwargs: None)

    response = asyncio.run(middleware.dispatch(_request(path), _next))

    assert response.status_code == 200
    assert response.body == b"ok"


def test_other_admin_paths_remain_csrf_protected():
    middleware = CSRFMiddleware(lambda *_args, **_kwargs: None)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(middleware.dispatch(_request("/api/admin/users"), _next))

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["error"] == "CSRF_TOKEN_MISSING"
