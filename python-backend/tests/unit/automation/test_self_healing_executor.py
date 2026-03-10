"""Unit tests for SelfHealingExecutor."""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, call

import pytest

from app.services.automation_exceptions import (
    CancellationRequestedError,
    HealingExhaustedError,
)
from app.services.playwright_script_generator import PlaywrightAction, PlaywrightScript
from app.services.self_healing_executor import (
    ExecutionResult,
    FailureDiagnosis,
    SelfHealingExecutor,
)


@pytest.fixture
def mock_browser_pool():
    mock_context = AsyncMock()
    mock_page = AsyncMock()
    mock_locator = AsyncMock()
    mock_frame_locator = MagicMock()
    mock_locator.count = AsyncMock(return_value=1)
    mock_locator.click = AsyncMock()
    mock_locator.fill = AsyncMock()
    mock_locator.set_input_files = AsyncMock()
    mock_locator.inner_text = AsyncMock(return_value="result text")
    mock_page.locator = MagicMock(return_value=mock_locator)
    mock_frame_locator.locator = MagicMock(return_value=mock_locator)
    mock_page.frame_locator = MagicMock(return_value=mock_frame_locator)
    mock_page.get_by_role = MagicMock(return_value=mock_locator)
    mock_page.screenshot = AsyncMock(return_value=b"\x89PNG\r\n" + b"\x00" * 50)
    mock_page.goto = AsyncMock()
    mock_page.evaluate = AsyncMock(return_value="clipboard text")
    mock_context.new_page = AsyncMock(return_value=mock_page)

    pool = AsyncMock()

    @asynccontextmanager
    async def session_cm(tenant_id):
        yield mock_context

    pool.session = session_cm
    pool._mock_page = mock_page
    pool._mock_locator = mock_locator
    pool._mock_frame_locator = mock_frame_locator
    return pool


@pytest.fixture
def mock_selector_cache():
    cache = AsyncMock()
    cache.mark_heal = AsyncMock()
    cache.invalidate = AsyncMock()
    return cache


@pytest.fixture
def mock_redis():
    redis = AsyncMock()
    redis.get = AsyncMock(return_value=None)  # No cancellation by default
    return redis


@pytest.fixture
def sample_script():
    return PlaywrightScript(
        url="http://example.com",
        goal="click submit and fill name",
        actions=[
            PlaywrightAction(
                action_type="click",
                selector_css="#btn",
                selector_strategies=["#btn"],
                description="Click submit",
                confidence=0.9,
            ),
            PlaywrightAction(
                action_type="fill",
                selector_css="#name",
                selector_strategies=["#name"],
                description="Fill name",
                confidence=0.9,
                value="John",
            ),
        ],
    )


@pytest.fixture
def executor(mock_browser_pool, mock_selector_cache, mock_redis):
    return SelfHealingExecutor(
        browser_pool=mock_browser_pool,
        selector_cache=mock_selector_cache,
        vision_model="gpt-4o",
        redis_client=mock_redis,
    )


@pytest.fixture
def status_callback():
    return AsyncMock()


class TestSuccessfulExecution:
    async def test_successful_first_try_returns_healed_false(
        self, executor, sample_script, status_callback
    ):
        result = await executor.execute(
            script=sample_script,
            execution_id="exec-1",
            tenant_id="t1",
            allowed_domains=["example.com"],
            status_callback=status_callback,
        )
        assert isinstance(result, ExecutionResult)
        assert result.healed is False
        assert result.heal_attempts == 0

    async def test_credits_used_reflects_actual_llm_calls(
        self, executor, sample_script, status_callback
    ):
        result = await executor.execute(
            script=sample_script,
            execution_id="exec-1",
            tenant_id="t1",
            allowed_domains=["example.com"],
            status_callback=status_callback,
        )
        assert result.credits_used == 0  # No healing needed

    async def test_upload_action_uses_set_input_files(
        self, executor, mock_browser_pool, status_callback
    ):
        script = PlaywrightScript(
            url="http://example.com",
            goal="upload a file",
            actions=[
                PlaywrightAction(
                    action_type="upload",
                    selector_css="input[type=file]",
                    selector_strategies=["input[type=file]"],
                    description="Upload report",
                    confidence=0.9,
                    value="/tmp/report.csv",
                ),
            ],
        )

        await executor.execute(
            script=script,
            execution_id="exec-1",
            tenant_id="t1",
            allowed_domains=["example.com"],
            status_callback=status_callback,
        )

        mock_browser_pool._mock_locator.set_input_files.assert_awaited_once_with(
            "/tmp/report.csv"
        )

    async def test_clipboard_actions_use_page_evaluate(
        self, executor, mock_browser_pool, status_callback
    ):
        mock_browser_pool._mock_page.locator = MagicMock(
            side_effect=AssertionError("clipboard actions should not need a locator")
        )
        script = PlaywrightScript(
            url="http://example.com",
            goal="copy and read clipboard",
            actions=[
                PlaywrightAction(
                    action_type="clipboard_write",
                    selector_css="clipboard_write",
                    selector_strategies=["clipboard_write"],
                    description="Copy result",
                    confidence=0.9,
                    value="secret token",
                ),
                PlaywrightAction(
                    action_type="clipboard_read",
                    selector_css="clipboard_read",
                    selector_strategies=["clipboard_read"],
                    description="Read clipboard",
                    confidence=0.9,
                ),
            ],
        )

        result = await executor.execute(
            script=script,
            execution_id="exec-1",
            tenant_id="t1",
            allowed_domains=["example.com"],
            status_callback=status_callback,
        )

        mock_browser_pool._mock_page.evaluate.assert_any_await(
            "(value) => navigator.clipboard.writeText(value)",
            "secret token",
        )
        mock_browser_pool._mock_page.evaluate.assert_any_await(
            "() => navigator.clipboard.readText()"
        )
        assert result.extracted_data == {"Read clipboard": "clipboard text"}

    async def test_goto_action_does_not_require_locator_lookup(
        self, executor, mock_browser_pool, status_callback
    ):
        mock_browser_pool._mock_page.locator = MagicMock(
            side_effect=AssertionError("goto should not need a locator")
        )
        script = PlaywrightScript(
            url="http://example.com",
            goal="navigate elsewhere",
            actions=[
                PlaywrightAction(
                    action_type="goto",
                    selector_css="https://example.com/dashboard",
                    selector_strategies=["https://example.com/dashboard"],
                    description="Go to dashboard",
                    confidence=0.9,
                    value="https://example.com/dashboard",
                ),
            ],
        )

        await executor.execute(
            script=script,
            execution_id="exec-1",
            tenant_id="t1",
            allowed_domains=["example.com"],
            status_callback=status_callback,
        )

        mock_browser_pool._mock_page.goto.assert_awaited_once_with(
            "https://example.com/dashboard"
        )

    async def test_frame_targeted_actions_use_frame_locator(
        self, executor, mock_browser_pool, status_callback
    ):
        script = PlaywrightScript(
            url="http://example.com",
            goal="fill a field in iframe",
            actions=[
                PlaywrightAction(
                    action_type="fill",
                    selector_css="#token",
                    selector_strategies=["#token"],
                    description="Fill token",
                    confidence=0.9,
                    value="secret",
                    frame_selector_css="iframe[data-testid='partner-frame']",
                    frame_origin="https://docs.example.com/embed",
                    iframe_trust_tier="same_site",
                ),
            ],
        )

        await executor.execute(
            script=script,
            execution_id="exec-1",
            tenant_id="t1",
            allowed_domains=["example.com"],
            status_callback=status_callback,
        )

        mock_browser_pool._mock_page.frame_locator.assert_called_once_with(
            "iframe[data-testid='partner-frame']"
        )
        mock_browser_pool._mock_locator.fill.assert_awaited_once_with("secret")


class TestHealingLoop:
    async def test_failure_triggers_diagnose_failure_call(
        self, executor, sample_script, mock_browser_pool, status_callback
    ):
        call_count = 0

        async def locator_click_side_effect():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise TimeoutError("Element not found")

        mock_browser_pool._mock_locator.click = AsyncMock(side_effect=locator_click_side_effect)

        executor._diagnose_failure = AsyncMock(
            return_value=FailureDiagnosis(
                root_cause="Element moved",
                suggested_new_selector={"css": "#new-btn"},
                confidence=0.8,
                action_type_still_valid=True,
            )
        )

        await executor.execute(
            script=sample_script,
            execution_id="exec-1",
            tenant_id="t1",
            allowed_domains=["example.com"],
            status_callback=status_callback,
        )
        executor._diagnose_failure.assert_awaited_once()

    async def test_successful_healing_replaces_failed_action_and_retries(
        self, executor, sample_script, mock_browser_pool, status_callback
    ):
        call_count = 0

        async def locator_click_side_effect():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise TimeoutError("Element not found")

        mock_browser_pool._mock_locator.click = AsyncMock(side_effect=locator_click_side_effect)

        executor._diagnose_failure = AsyncMock(
            return_value=FailureDiagnosis(
                root_cause="Element moved",
                suggested_new_selector={"css": "#new-btn"},
                confidence=0.8,
                action_type_still_valid=True,
            )
        )

        result = await executor.execute(
            script=sample_script,
            execution_id="exec-1",
            tenant_id="t1",
            allowed_domains=["example.com"],
            status_callback=status_callback,
        )
        assert result.healed is True
        assert result.heal_attempts == 1

    async def test_healed_action_list_stored_in_cache(
        self, executor, sample_script, mock_browser_pool, mock_selector_cache, status_callback
    ):
        call_count = 0

        async def locator_click_side_effect():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise TimeoutError("Element not found")

        mock_browser_pool._mock_locator.click = AsyncMock(side_effect=locator_click_side_effect)

        executor._diagnose_failure = AsyncMock(
            return_value=FailureDiagnosis(
                root_cause="Changed",
                suggested_new_selector={"css": "#new-btn"},
                confidence=0.8,
                action_type_still_valid=True,
            )
        )

        await executor.execute(
            script=sample_script,
            execution_id="exec-1",
            tenant_id="t1",
            allowed_domains=["example.com"],
            status_callback=status_callback,
        )
        mock_selector_cache.mark_heal.assert_awaited_once()

    async def test_three_failed_heals_raises_healing_exhausted(
        self, executor, sample_script, mock_browser_pool, mock_selector_cache, status_callback
    ):
        mock_browser_pool._mock_locator.click = AsyncMock(
            side_effect=TimeoutError("Always fails")
        )

        executor._diagnose_failure = AsyncMock(
            return_value=FailureDiagnosis(
                root_cause="Gone",
                suggested_new_selector={"css": "#still-wrong"},
                confidence=0.3,
                action_type_still_valid=True,
            )
        )

        with pytest.raises(HealingExhaustedError):
            await executor.execute(
                script=sample_script,
                execution_id="exec-1",
                tenant_id="t1",
                allowed_domains=["example.com"],
                status_callback=status_callback,
            )
        mock_selector_cache.invalidate.assert_awaited_once()


class TestRegenerateFromFailure:
    async def test_regenerate_returns_none_when_element_gone(self, executor):
        diagnosis = FailureDiagnosis(
            root_cause="Removed",
            suggested_new_selector=None,
            confidence=0.1,
            action_type_still_valid=False,
        )
        original = PlaywrightAction(
            action_type="click",
            selector_css="#btn",
            selector_strategies=["#btn"],
            description="Click",
            confidence=0.9,
        )
        mock_page = AsyncMock()
        result = await executor.regenerate_from_failure(diagnosis, original, mock_page)
        assert result is None


class TestGetByRoleGuard:
    async def test_get_by_role_zero_matches_handled(
        self, executor, mock_browser_pool, status_callback
    ):
        mock_browser_pool._mock_locator.count = AsyncMock(return_value=0)

        script = PlaywrightScript(
            url="http://example.com",
            goal="click button",
            actions=[
                PlaywrightAction(
                    action_type="click",
                    selector_css='role=button[name="Submit"]',
                    selector_strategies=['role=button[name="Submit"]'],
                    description="Click submit",
                    confidence=0.9,
                )
            ],
        )

        # Should enter healing loop, not crash
        executor._diagnose_failure = AsyncMock(
            return_value=FailureDiagnosis(
                root_cause="Element gone",
                suggested_new_selector=None,
                confidence=0.1,
                action_type_still_valid=False,
            )
        )

        with pytest.raises(HealingExhaustedError):
            await executor.execute(
                script=script,
                execution_id="exec-1",
                tenant_id="t1",
                allowed_domains=["example.com"],
                status_callback=status_callback,
            )


class TestCancellation:
    async def test_cancellation_check_between_actions(
        self, executor, sample_script, mock_redis, status_callback
    ):
        mock_redis.get = AsyncMock(return_value=b"1")

        with pytest.raises(CancellationRequestedError):
            await executor.execute(
                script=sample_script,
                execution_id="exec-1",
                tenant_id="t1",
                allowed_domains=["example.com"],
                status_callback=status_callback,
            )


class TestStatusCallback:
    async def test_status_callback_called_at_each_phase(
        self, executor, sample_script, status_callback
    ):
        await executor.execute(
            script=sample_script,
            execution_id="exec-1",
            tenant_id="t1",
            allowed_domains=["example.com"],
            status_callback=status_callback,
        )
        calls = [c.args[0] for c in status_callback.call_args_list]
        assert "running" in calls
        assert "success" in calls
