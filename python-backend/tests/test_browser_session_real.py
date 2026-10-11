"""Browser input safety and fail-closed isolated-runtime contracts."""

from unittest.mock import MagicMock

import pytest

from app.services.tools.browser_tool import (
    BrowserSession,
    BrowserSessionFactory,
    ssrf_route_filter,
)


def _make_session(dispatcher=None, allowed_domains=None):
    return BrowserSession(
        user_id=1,
        tenant_id="tenant-test",
        allowed_domains=allowed_domains or ["example.com"],
        dispatcher=dispatcher,
    )


@pytest.mark.asyncio
async def test_browser_actions_fail_closed_without_approved_runtime():
    dispatcher = MagicMock()
    session = _make_session(dispatcher=dispatcher)

    with pytest.raises(RuntimeError, match="approved Cloudflare Container runtime"):
        await session.click("#button")

    dispatcher.dispatch.assert_not_called()


@pytest.mark.asyncio
async def test_navigation_rejects_private_targets_before_runtime_dispatch():
    dispatcher = MagicMock()
    session = _make_session(dispatcher=dispatcher)

    with pytest.raises(ValueError, match="[Bb]locked|[Pp]rivate"):
        await session.navigate("http://10.0.0.1/admin")

    dispatcher.dispatch.assert_not_called()


@pytest.mark.asyncio
async def test_action_limit_is_checked_before_runtime_dispatch():
    session = _make_session()
    actions = [{"action": "click", "selector": f"#button-{index}"} for index in range(51)]

    with pytest.raises(ValueError, match="[Tt]oo many actions|exceeds maximum"):
        await session.execute_actions(actions)


@pytest.mark.parametrize(
    ("url", "allowed_domains"),
    [
        ("http://10.0.0.1/path", ["example.com"]),
        ("http://169.254.169.254/latest/meta-data/", ["example.com"]),
        ("https://evil.com/path", ["example.com"]),
        ("http://metadata.google.internal/computeMetadata/", ["example.com"]),
        ("http://172.16.0.1/", ["example.com"]),
        ("http://192.168.1.1/", ["example.com"]),
    ],
)
def test_route_filter_blocks_private_and_unapproved_targets(url, allowed_domains):
    assert ssrf_route_filter(url, allowed_domains) is False


@pytest.mark.parametrize(
    "url",
    ["https://example.com/page", "https://sub.example.com/page"],
)
def test_route_filter_allows_allowlisted_hosts(url):
    assert ssrf_route_filter(url, ["example.com"]) is True


def test_factory_does_not_create_a_retired_local_dispatcher():
    factory = BrowserSessionFactory(db_session=MagicMock())
    session = factory.create(user_id=42, tenant_id="tenant-test", allowed_domains=["example.com"])

    assert session._dispatcher is None
    assert session._user_id == 42
    assert session._tenant_id == "tenant-test"
