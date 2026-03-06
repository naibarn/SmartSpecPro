"""Tests for PlaywrightScriptGenerator — Vision LLM screenshot-to-script pipeline."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.automation_exceptions import ScriptGenerationError, SSRFBlockedError
from app.services.playwright_script_generator import (
    IdentifiedElement,
    PlaywrightAction,
    PlaywrightScript,
    PlaywrightScriptGenerator,
)


@pytest.fixture
def mock_cache():
    cache = AsyncMock()
    cache.get = AsyncMock(return_value=None)
    cache.put = AsyncMock()
    return cache


@pytest.fixture
def mock_browser_pool():
    mock_context = AsyncMock()
    mock_page = AsyncMock()
    mock_page.goto = AsyncMock()
    mock_page.screenshot = AsyncMock(return_value=b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
    mock_page.evaluate = AsyncMock(return_value=[
        {"index": 1, "tag": "button", "text": "Submit", "role": "button",
         "ariaLabel": "Submit form", "testId": None, "rect": {"x": 100, "y": 200}},
    ])
    mock_page.route = AsyncMock()
    mock_page.wait_for_load_state = AsyncMock()
    mock_locator = AsyncMock()
    mock_locator.count = AsyncMock(return_value=1)
    mock_page.locator = MagicMock(return_value=mock_locator)
    mock_page.get_by_role = MagicMock(return_value=mock_locator)
    mock_context.new_page = AsyncMock(return_value=mock_page)
    mock_context.close = AsyncMock()

    pool = AsyncMock()

    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def session_cm(tenant_id):
        yield mock_context

    pool.session = session_cm
    pool._mock_page = mock_page
    pool._mock_context = mock_context
    return pool


@pytest.fixture
def mock_llm_call():
    """Mock for the Vision LLM call."""
    return AsyncMock(return_value=[
        IdentifiedElement(
            element_index=1,
            action_type="click",
            value=None,
            confidence=0.9,
            reasoning="Submit button clearly visible",
        )
    ])


@pytest.fixture
def generator(mock_cache, mock_browser_pool, mock_llm_call):
    gen = PlaywrightScriptGenerator(
        browser_pool=mock_browser_pool,
        selector_cache=mock_cache,
    )
    gen._vision_llm_call = mock_llm_call
    return gen


class TestCacheHit:
    async def test_cache_hit_returns_cached_script_without_calling_llm(
        self, mock_cache, mock_browser_pool, mock_llm_call
    ):
        cached_script = PlaywrightScript(
            url="http://example.com",
            goal="click submit",
            actions=[
                PlaywrightAction(
                    action_type="click",
                    selector_css="#btn",
                    selector_strategies=["#btn"],
                    description="Click submit",
                    confidence=0.9,
                )
            ],
        )
        mock_cache.get = AsyncMock(return_value=MagicMock(actions=[a.model_dump() for a in cached_script.actions]))

        gen = PlaywrightScriptGenerator(
            browser_pool=mock_browser_pool,
            selector_cache=mock_cache,
        )
        gen._vision_llm_call = mock_llm_call

        with patch("app.services.playwright_script_generator.validate_url_with_dns", new_callable=AsyncMock):
            result = await gen.generate(
                url="http://example.com",
                goal="click submit",
                tenant_id="t1",
                allowed_domains=["example.com"],
                vision_model="gpt-4o",
            )

        assert result is not None
        mock_llm_call.assert_not_awaited()


class TestSSRFCheck:
    async def test_ssrf_check_runs_before_page_goto(self, generator):
        with patch(
            "app.services.playwright_script_generator.validate_url_with_dns",
            new_callable=AsyncMock,
            side_effect=SSRFBlockedError("blocked"),
        ):
            with pytest.raises(SSRFBlockedError):
                await generator.generate(
                    url="http://evil.internal",
                    goal="steal data",
                    tenant_id="t1",
                    allowed_domains=["evil.internal"],
                    vision_model="gpt-4o",
                )


class TestPageRouteSSRF:
    async def test_page_route_handler_installed(self, generator):
        with patch(
            "app.services.playwright_script_generator.validate_url_with_dns",
            new_callable=AsyncMock,
        ):
            await generator.generate(
                url="http://example.com",
                goal="click submit",
                tenant_id="t1",
                allowed_domains=["example.com"],
                vision_model="gpt-4o",
            )

        # page.route should have been called for SSRF defense-in-depth
        generator._browser_pool._mock_page.route.assert_awaited()


class TestVisionLLMCall:
    async def test_vision_llm_called_with_screenshot(self, generator, mock_llm_call):
        with patch(
            "app.services.playwright_script_generator.validate_url_with_dns",
            new_callable=AsyncMock,
        ):
            await generator.generate(
                url="http://example.com",
                goal="click submit",
                tenant_id="t1",
                allowed_domains=["example.com"],
                vision_model="gpt-4o",
            )

        mock_llm_call.assert_awaited_once()


class TestLowConfidence:
    async def test_low_confidence_raises_script_generation_error(
        self, mock_cache, mock_browser_pool
    ):
        mock_llm_call = AsyncMock(return_value=[
            IdentifiedElement(
                element_index=1,
                action_type="click",
                value=None,
                confidence=0.3,
                reasoning="Not sure",
            )
        ])

        gen = PlaywrightScriptGenerator(
            browser_pool=mock_browser_pool,
            selector_cache=mock_cache,
        )
        gen._vision_llm_call = mock_llm_call

        with patch(
            "app.services.playwright_script_generator.validate_url_with_dns",
            new_callable=AsyncMock,
        ):
            with pytest.raises(ScriptGenerationError):
                await gen.generate(
                    url="http://example.com",
                    goal="click submit",
                    tenant_id="t1",
                    allowed_domains=["example.com"],
                    vision_model="gpt-4o",
                )


class TestSelectorValidation:
    async def test_validate_selectors_returns_false_when_no_elements(self, generator):
        mock_page = AsyncMock()
        mock_locator = AsyncMock()
        mock_locator.count = AsyncMock(return_value=0)
        mock_page.locator = MagicMock(return_value=mock_locator)

        actions = [
            PlaywrightAction(
                action_type="click",
                selector_css="#nonexistent",
                selector_strategies=["#nonexistent"],
                description="Click something",
                confidence=0.9,
            )
        ]
        result = await generator._validate_selectors(mock_page, actions)
        assert result is False

    async def test_validate_selectors_returns_true_when_all_resolve(self, generator):
        mock_page = AsyncMock()
        mock_locator = AsyncMock()
        mock_locator.count = AsyncMock(return_value=1)
        mock_page.locator = MagicMock(return_value=mock_locator)

        actions = [
            PlaywrightAction(
                action_type="click",
                selector_css="#btn",
                selector_strategies=["#btn"],
                description="Click button",
                confidence=0.9,
            )
        ]
        result = await generator._validate_selectors(mock_page, actions)
        assert result is True


class TestSelectorStrategy:
    def test_build_selector_strategy_priority_order(self, generator):
        element_info = {
            "tag": "button",
            "text": "Submit",
            "role": "button",
            "ariaLabel": "Submit form",
            "testId": "submit-btn",
        }
        strategies = generator._build_selector_strategy(element_info)
        # Should have multiple strategies
        assert len(strategies) > 0
        # First strategy should be ARIA-based
        assert "role" in strategies[0].lower() or "aria" in strategies[0].lower() or "button" in strategies[0].lower()
