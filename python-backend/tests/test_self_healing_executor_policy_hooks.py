"""Runtime browser policy hooks for the self-healing executor."""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.automation_exceptions import BrowserPolicyDeniedError
from app.services.playwright_script_generator import PlaywrightAction, PlaywrightScript
from app.services.self_healing_executor import SelfHealingExecutor


@pytest.fixture
def mock_browser_pool():
    mock_context = AsyncMock()
    mock_page = AsyncMock()
    mock_page.url = "https://example.com/start"
    event_handlers: dict[str, list] = {}

    mock_locator = AsyncMock()
    mock_locator.count = AsyncMock(return_value=1)
    mock_locator.click = AsyncMock()
    mock_locator.fill = AsyncMock()
    mock_locator.inner_text = AsyncMock(return_value="result text")

    async def goto_side_effect(url: str):
        mock_page.url = url

    mock_page.goto = AsyncMock(side_effect=goto_side_effect)
    mock_page.locator = MagicMock(return_value=mock_locator)
    mock_page.on = MagicMock(
        side_effect=lambda event_name, handler: event_handlers.setdefault(event_name, []).append(handler)
    )
    mock_page.emit = lambda event_name, payload: [
        handler(payload) for handler in event_handlers.get(event_name, [])
    ]
    mock_context.new_page = AsyncMock(return_value=mock_page)

    pool = AsyncMock()

    @asynccontextmanager
    async def session_cm(_tenant_id):
        yield mock_context

    pool.session = session_cm
    pool._mock_page = mock_page
    pool._mock_locator = mock_locator
    return pool


@pytest.fixture
def mock_selector_cache():
    cache = AsyncMock()
    cache.mark_heal = AsyncMock()
    cache.invalidate = AsyncMock()
    return cache


@pytest.fixture
def status_callback():
    return AsyncMock()


@pytest.fixture
def policy_client():
    client = AsyncMock()
    client.enforce_before_action = AsyncMock()
    client.enforce_transition = AsyncMock()
    return client


async def test_executor_calls_policy_before_dispatch_and_on_origin_transition(
    mock_browser_pool,
    mock_selector_cache,
    policy_client,
    status_callback,
):
    executor = SelfHealingExecutor(
        browser_pool=mock_browser_pool,
        selector_cache=mock_selector_cache,
        policy_client=policy_client,
    )
    script = PlaywrightScript(
        url="https://example.com/start",
        goal="navigate and click",
        actions=[
            PlaywrightAction(
                action_type="goto",
                selector_css="https://example.com/dashboard",
                selector_strategies=["https://example.com/dashboard"],
                description="Go to dashboard",
                confidence=0.9,
                value="https://example.com/dashboard",
            ),
            PlaywrightAction(
                action_type="click",
                selector_css="#submit",
                selector_strategies=["#submit"],
                description="Click submit",
                confidence=0.9,
            ),
        ],
    )

    await executor.execute(
        script=script,
        execution_id="exec-1",
        tenant_id="tenant-1",
        allowed_domains=["example.com"],
        status_callback=status_callback,
    )

    assert policy_client.enforce_before_action.await_count == 2
    policy_client.enforce_transition.assert_awaited_once()


async def test_executor_rechecks_popup_and_iframe_events(
    mock_browser_pool,
    mock_selector_cache,
    policy_client,
    status_callback,
):
    popup_page = MagicMock()
    popup_page.url = "https://popup.example.com/welcome"

    iframe = MagicMock()
    iframe.url = "https://frame.example.net/embed"

    async def click_side_effect():
        mock_browser_pool._mock_page.emit("popup", popup_page)
        mock_browser_pool._mock_page.emit("framenavigated", iframe)

    mock_browser_pool._mock_locator.click = AsyncMock(side_effect=click_side_effect)

    executor = SelfHealingExecutor(
        browser_pool=mock_browser_pool,
        selector_cache=mock_selector_cache,
        policy_client=policy_client,
    )
    script = PlaywrightScript(
        url="https://example.com/start",
        goal="click a button that opens related content",
        actions=[
            PlaywrightAction(
                action_type="click",
                selector_css="#launch",
                selector_strategies=["#launch"],
                description="Launch popup",
                confidence=0.9,
            ),
        ],
    )

    await executor.execute(
        script=script,
        execution_id="exec-1",
        tenant_id="tenant-1",
        allowed_domains=["example.com"],
        status_callback=status_callback,
    )

    assert policy_client.enforce_transition.await_count == 2
    observed_origins = [
        call.kwargs["next_origin"] for call in policy_client.enforce_transition.await_args_list
    ]
    assert observed_origins == [
        "https://popup.example.com",
        "https://frame.example.net",
    ]


async def test_executor_fails_closed_on_browser_prompt_surfaces(
    mock_browser_pool,
    mock_selector_cache,
    policy_client,
    status_callback,
):
    dialog = MagicMock()
    dialog.type = MagicMock(return_value="confirm")
    dialog.dismiss = AsyncMock()

    async def click_side_effect():
        mock_browser_pool._mock_page.emit("dialog", dialog)
        mock_browser_pool._mock_page.emit("filechooser", MagicMock())
        mock_browser_pool._mock_page.emit("download", MagicMock())

    mock_browser_pool._mock_locator.click = AsyncMock(side_effect=click_side_effect)

    executor = SelfHealingExecutor(
        browser_pool=mock_browser_pool,
        selector_cache=mock_selector_cache,
        policy_client=policy_client,
    )
    script = PlaywrightScript(
        url="https://example.com/start",
        goal="click export",
        actions=[
            PlaywrightAction(
                action_type="click",
                selector_css="#export",
                selector_strategies=["#export"],
                description="Open export flow",
                confidence=0.9,
            ),
        ],
    )

    await executor.execute(
        script=script,
        execution_id="exec-1",
        tenant_id="tenant-1",
        allowed_domains=["example.com"],
        status_callback=status_callback,
    )

    observed_action_types = [
        call.kwargs["action"].action_type for call in policy_client.enforce_before_action.await_args_list
    ]
    assert observed_action_types == [
        "click",
        "permission_prompt",
        "file_picker",
        "download",
    ]
    dialog.dismiss.assert_awaited_once()


async def test_executor_stops_when_policy_blocks_action(
    mock_browser_pool,
    mock_selector_cache,
    policy_client,
    status_callback,
):
    policy_client.enforce_before_action.side_effect = BrowserPolicyDeniedError(
        "Browser policy blocked action"
    )
    executor = SelfHealingExecutor(
        browser_pool=mock_browser_pool,
        selector_cache=mock_selector_cache,
        policy_client=policy_client,
        max_heal_attempts=0,
    )
    script = PlaywrightScript(
        url="https://example.com/start",
        goal="click submit",
        actions=[
            PlaywrightAction(
                action_type="click",
                selector_css="#submit",
                selector_strategies=["#submit"],
                description="Click submit",
                confidence=0.9,
            )
        ],
    )

    with pytest.raises(Exception, match="Failed after 0 heal attempts"):
        await executor.execute(
            script=script,
            execution_id="exec-1",
            tenant_id="tenant-1",
            allowed_domains=["example.com"],
            status_callback=status_callback,
        )

    mock_browser_pool._mock_locator.click.assert_not_awaited()
