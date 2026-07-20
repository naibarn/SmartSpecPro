import hashlib

import pytest
from starlette.requests import Request
from starlette.responses import Response

from app.core import auth, middleware
from app.core.middleware import RateLimitMiddleware, resolve_rate_limit_identity


def test_uses_numeric_subject_for_authenticated_user_bucket():
    assert resolve_rate_limit_identity({"sub": "42"}, "127.0.0.1") == (
        "user:42",
        "42",
    )


def test_supports_legacy_user_id_claim():
    assert resolve_rate_limit_identity({"user_id": 73}, "127.0.0.1") == (
        "user:73",
        "73",
    )


def test_hashes_verified_open_id_without_exposing_raw_identifier():
    open_id = "node-session-user@example.test"
    digest = hashlib.sha256(open_id.encode("utf-8")).hexdigest()

    key, audit_identity = resolve_rate_limit_identity(
        {"openId": open_id},
        "127.0.0.1",
    )

    assert key == f"user-openid:{digest}"
    assert audit_identity == f"openid:{digest[:12]}"
    assert open_id not in key
    assert open_id not in audit_identity


def test_falls_back_to_ip_for_missing_or_invalid_numeric_identity():
    assert resolve_rate_limit_identity({}, "127.0.0.1") == (
        "ip:127.0.0.1",
        None,
    )
    assert resolve_rate_limit_identity(
        {"sub": "not-numeric"},
        "127.0.0.1",
    ) == ("ip:127.0.0.1", None)


@pytest.mark.asyncio
async def test_dispatch_uses_resolved_verified_identity(monkeypatch):
    open_id = "verified-node-session"
    digest = hashlib.sha256(open_id.encode("utf-8")).hexdigest()
    observed = {}

    monkeypatch.setattr(
        auth,
        "verify_token",
        lambda _token, expected_type=None: {
            "openId": open_id,
            "type": expected_type,
        },
    )

    def check_rate_limit(key, *, is_authenticated, tier):
        observed.update(
            key=key,
            is_authenticated=is_authenticated,
            tier=tier,
        )
        return True, {
            "limit": 120,
            "remaining": 119,
            "reset": 1,
            "retry_after": 0,
        }

    monkeypatch.setattr(
        middleware.rate_limiter,
        "check_rate_limit",
        check_rate_limit,
    )
    request = Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/v1/media/tasks",
            "raw_path": b"/api/v1/media/tasks",
            "query_string": b"",
            "headers": [(b"authorization", b"Bearer verified-token")],
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
        },
    )
    rate_limit_middleware = RateLimitMiddleware(lambda _scope, _receive, _send: None)

    async def call_next(_request):
        return Response(status_code=200)

    response = await rate_limit_middleware.dispatch(
        request,
        call_next,
    )

    assert response.status_code == 200
    assert observed == {
        "key": f"user-openid:{digest}",
        "is_authenticated": True,
        "tier": "standard",
    }
