"""Tests for agency guardrails execution engine."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.agency_guardrails import (
    GuardrailDefinition,
    GuardrailResult,
    execute_guardrails,
    _strategy_custom_endpoint,
    _strategy_json_schema,
    _strategy_keyword_block,
    _strategy_llm_classify,
    _strategy_max_length,
    _strategy_pii_detection,
    _strategy_regex_match,
)


# ── keyword_block ─────────────────────────────────────────────────────────────


@pytest.mark.unit
@pytest.mark.asyncio
async def test_keyword_block_blocks_message_containing_keyword():
    result = await _strategy_keyword_block(
        "Please share your Password",
        {"keywords": ["password", "credit card"]},
    )
    assert result.passed is False
    assert "password" in result.message.lower()
    assert result.action == "block"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_keyword_block_passes_message_without_keywords():
    result = await _strategy_keyword_block(
        "Hello world",
        {"keywords": ["password"]},
    )
    assert result.passed is True


# ── regex_match ───────────────────────────────────────────────────────────────


@pytest.mark.unit
@pytest.mark.asyncio
async def test_regex_match_blocks_message_matching_pattern():
    result = await _strategy_regex_match(
        "My SSN is 123-45-6789",
        {"pattern": r"\b\d{3}-\d{2}-\d{4}\b", "action": "block"},
    )
    assert result.passed is False


@pytest.mark.unit
@pytest.mark.asyncio
async def test_regex_match_passes_when_no_match():
    result = await _strategy_regex_match(
        "No credit card here",
        {"pattern": r"\b\d{16}\b"},
    )
    assert result.passed is True


# ── llm_classify ──────────────────────────────────────────────────────────────


@pytest.mark.unit
@pytest.mark.asyncio
async def test_llm_classify_blocks_when_matching():
    mock_client = AsyncMock()
    mock_client.chat.return_value = {"content": "harmful"}

    result = await _strategy_llm_classify(
        "some bad message",
        {"prompt": "Classify: {message}", "blockIf": "harmful", "model": "gpt-4o-mini"},
        llm_client=mock_client,
    )
    assert result.passed is False
    assert result.action == "block"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_llm_classify_passes_when_non_matching():
    mock_client = AsyncMock()
    mock_client.chat.return_value = {"content": "safe"}

    result = await _strategy_llm_classify(
        "hello there",
        {"blockIf": "harmful"},
        llm_client=mock_client,
    )
    assert result.passed is True


@pytest.mark.unit
@pytest.mark.asyncio
async def test_llm_classify_failopen_on_error():
    mock_client = AsyncMock()
    mock_client.chat.side_effect = Exception("LLM down")

    result = await _strategy_llm_classify(
        "test message",
        {"blockIf": "harmful"},
        llm_client=mock_client,
    )
    assert result.passed is True  # fail-open


# ── json_schema ───────────────────────────────────────────────────────────────


@pytest.mark.unit
@pytest.mark.asyncio
async def test_json_schema_validates_valid_output():
    result = await _strategy_json_schema(
        '{"name": "test"}',
        {"schema": {"type": "object", "required": ["name"], "properties": {"name": {"type": "string"}}}},
    )
    assert result.passed is True


@pytest.mark.unit
@pytest.mark.asyncio
async def test_json_schema_rejects_invalid_json_output():
    result = await _strategy_json_schema(
        '{"age": 25}',
        {"schema": {"type": "object", "required": ["name"]}},
    )
    assert result.passed is False
    assert "name" in result.message.lower()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_json_schema_rejects_non_json_text():
    result = await _strategy_json_schema(
        "This is not JSON",
        {"schema": {"type": "object"}},
    )
    assert result.passed is False
    assert "json" in result.message.lower()


# ── max_length ────────────────────────────────────────────────────────────────


@pytest.mark.unit
@pytest.mark.asyncio
async def test_max_length_blocks_exceeding():
    result = await _strategy_max_length("A" * 101, {"maxChars": 100})
    assert result.passed is False


@pytest.mark.unit
@pytest.mark.asyncio
async def test_max_length_passes_within_limit():
    result = await _strategy_max_length("Short message", {"maxChars": 100})
    assert result.passed is True


# ── pii_detection ─────────────────────────────────────────────────────────────


@pytest.mark.unit
@pytest.mark.asyncio
async def test_pii_detection_detects_email():
    result = await _strategy_pii_detection(
        "Contact me at user@example.com",
        {"patterns": ["email"]},
    )
    assert result.passed is False


@pytest.mark.unit
@pytest.mark.asyncio
async def test_pii_detection_detects_phone():
    result = await _strategy_pii_detection(
        "Call me at 555-123-4567",
        {"patterns": ["phone"]},
    )
    assert result.passed is False


@pytest.mark.unit
@pytest.mark.asyncio
async def test_pii_detection_detects_ssn():
    result = await _strategy_pii_detection(
        "SSN: 123-45-6789",
        {"patterns": ["ssn"]},
    )
    assert result.passed is False


@pytest.mark.unit
@pytest.mark.asyncio
async def test_pii_detection_redact_replaces_with_marker():
    result = await _strategy_pii_detection(
        "Email: user@example.com please",
        {"patterns": ["email"], "action": "redact"},
    )
    assert result.passed is True
    assert result.redacted_message is not None
    assert "[REDACTED]" in result.redacted_message
    assert "user@example.com" not in result.redacted_message


# ── custom_endpoint ───────────────────────────────────────────────────────────


@pytest.mark.unit
@pytest.mark.asyncio
async def test_custom_endpoint_returns_result():
    mock_response = MagicMock()
    mock_response.json.return_value = {"passed": False, "message": "blocked by policy"}
    mock_response.raise_for_status = MagicMock()

    mock_guard = AsyncMock()
    mock_guard.validate_url = AsyncMock()

    with patch(
        "app.orchestrator.node_executors.io_executors.ssrf_guard.SSRFGuard",
        return_value=mock_guard,
    ), patch("httpx.AsyncClient") as MockClient:
        mock_client_instance = AsyncMock()
        mock_client_instance.post.return_value = mock_response
        MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client_instance)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=None)

        result = await _strategy_custom_endpoint(
            "test message",
            {"endpoint": "https://guardrails.example.com/check"},
        )
        assert result.passed is False
        assert result.message == "blocked by policy"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_custom_endpoint_rejects_private_ip():
    mock_guard = AsyncMock()
    mock_guard.validate_url = AsyncMock(
        side_effect=ValueError("SSRF: private IP blocked")
    )

    with patch(
        "app.orchestrator.node_executors.io_executors.ssrf_guard.SSRFGuard",
        return_value=mock_guard,
    ):
        result = await _strategy_custom_endpoint(
            "test",
            {"endpoint": "http://192.168.1.1/check"},
        )
        assert result.passed is False
        assert "SSRF" in result.message


# ── execute_guardrails orchestration ──────────────────────────────────────────


@pytest.mark.unit
@pytest.mark.asyncio
async def test_execute_guardrails_runs_in_sort_order():
    call_order = []

    async def mock_strategy(message, config):
        call_order.append(config["order"])
        return GuardrailResult(passed=True)

    guardrails = [
        GuardrailDefinition(id="g2", name="G2", type="input", mode="strict", strategy="keyword_block",
                            config={"order": 2, "keywords": []}, sort_order=2),
        GuardrailDefinition(id="g0", name="G0", type="input", mode="strict", strategy="keyword_block",
                            config={"order": 0, "keywords": []}, sort_order=0),
        GuardrailDefinition(id="g1", name="G1", type="input", mode="strict", strategy="keyword_block",
                            config={"order": 1, "keywords": []}, sort_order=1),
    ]

    with patch("app.services.agency_guardrails.STRATEGY_MAP", {"keyword_block": mock_strategy}):
        await execute_guardrails(guardrails, "test", "input")

    assert call_order == [0, 1, 2]


@pytest.mark.unit
@pytest.mark.asyncio
async def test_execute_guardrails_stops_on_strict_failure():
    call_count = 0

    async def mock_kw(message, config):
        nonlocal call_count
        call_count += 1
        if config.get("fail"):
            return GuardrailResult(passed=False, message="blocked", action="block")
        return GuardrailResult(passed=True)

    guardrails = [
        GuardrailDefinition(id="g0", name="G0", type="input", mode="strict", strategy="keyword_block",
                            config={"keywords": []}, sort_order=0),
        GuardrailDefinition(id="g1", name="G1", type="input", mode="strict", strategy="keyword_block",
                            config={"fail": True, "keywords": []}, sort_order=1),
        GuardrailDefinition(id="g2", name="G2", type="input", mode="strict", strategy="keyword_block",
                            config={"keywords": []}, sort_order=2),
    ]

    with patch("app.services.agency_guardrails.STRATEGY_MAP", {"keyword_block": mock_kw}):
        result = await execute_guardrails(guardrails, "test", "input")

    assert result.passed is False
    assert call_count == 2  # third guardrail not called


@pytest.mark.unit
@pytest.mark.asyncio
async def test_execute_guardrails_collects_guidance_failures():
    async def mock_kw(message, config):
        if config.get("fail"):
            return GuardrailResult(passed=False, message="warning", action="block")
        return GuardrailResult(passed=True)

    guardrails = [
        GuardrailDefinition(id="g0", name="G0", type="input", mode="guidance", strategy="keyword_block",
                            config={"keywords": []}, sort_order=0),
        GuardrailDefinition(id="g1", name="G1", type="input", mode="guidance", strategy="keyword_block",
                            config={"fail": True, "keywords": []}, sort_order=1),
        GuardrailDefinition(id="g2", name="G2", type="input", mode="guidance", strategy="keyword_block",
                            config={"keywords": []}, sort_order=2),
    ]

    with patch("app.services.agency_guardrails.STRATEGY_MAP", {"keyword_block": mock_kw}):
        result = await execute_guardrails(guardrails, "test", "input")

    assert result.passed is True
    assert result.action == "guidance"
    assert "G1" in result.message


@pytest.mark.unit
@pytest.mark.asyncio
async def test_execute_guardrails_handoff_filter():
    """enforceOnHandoff=true runs input guardrails on handoff messages."""
    guardrails = [
        GuardrailDefinition(id="g0", name="No-handoff", type="input", mode="strict",
                            strategy="keyword_block",
                            config={"keywords": ["secret"]}, enforce_on_handoff=False),
        GuardrailDefinition(id="g1", name="Handoff-yes", type="input", mode="strict",
                            strategy="keyword_block",
                            config={"keywords": ["secret"]}, enforce_on_handoff=True),
    ]

    # With is_handoff=True, only g1 should run and block
    result = await execute_guardrails(guardrails, "my secret plan", "input", is_handoff=True)
    assert result.passed is False  # g1 should block


@pytest.mark.unit
@pytest.mark.asyncio
async def test_output_guardrail_retry_pattern():
    """Output guardrail retries up to validationAttempts."""
    call_count = 0

    guardrail = GuardrailDefinition(
        id="g0", name="Schema", type="output", mode="strict",
        strategy="json_schema",
        config={"schema": {"type": "object", "required": ["name"]}},
        validation_attempts=3,
    )

    outputs = ['{"age": 25}', '{"age": 30}', '{"name": "ok"}']

    for attempt in range(guardrail.validation_attempts):
        result = await execute_guardrails([guardrail], outputs[attempt], "output")
        call_count += 1
        if result.passed:
            break

    assert call_count == 3
    assert result.passed is True
