"""
Unit tests for workflow generator retry loop and few-shot cache.
All LLM gateway calls are mocked — no network calls.
Run: cd python-backend && uv run pytest tests/test_workflow_generator.py -m unit -v
"""
import json
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from pydantic import ValidationError


# --- Valid workflow fixture ---
VALID_WORKFLOW = {
    "nodes": [
        {
            "id": "trigger_1",
            "type": "workflow",
            "position": {"x": 0, "y": 0},
            "data": {"nodeType": "manual_trigger", "label": "Start", "config": {}},
        },
        {
            "id": "llm_1",
            "type": "workflow",
            "position": {"x": 280, "y": 0},
            "data": {"nodeType": "llm_call", "label": "Generate", "config": {"model": "gpt-4o-mini", "temperature": 0.7, "maxTokens": 1000}},
        },
        {
            "id": "resp_1",
            "type": "workflow",
            "position": {"x": 560, "y": 0},
            "data": {"nodeType": "workflow_response", "label": "Output", "config": {"status": "success"}},
        },
    ],
    "edges": [
        {"id": "e1", "source": "trigger_1", "target": "llm_1", "sourceHandle": "params", "targetHandle": "prompt", "type": "smoothstep"},
        {"id": "e2", "source": "llm_1", "target": "resp_1", "sourceHandle": "response", "targetHandle": "data", "type": "smoothstep"},
    ],
    "description": "Simple LLM workflow",
}

# Missing trigger node — will fail validation
INVALID_WORKFLOW_NO_TRIGGER = {
    "nodes": [
        {
            "id": "llm_1",
            "type": "workflow",
            "position": {"x": 0, "y": 0},
            "data": {"nodeType": "llm_call", "label": "Generate", "config": {}},
        },
    ],
    "edges": [],
    "description": "Missing trigger",
}


def _make_gateway_response(workflow_dict: dict, status_code: int = 200) -> MagicMock:
    """Create a mock HTTP response from the gateway."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = {
        "choices": [{"message": {"content": json.dumps(workflow_dict)}}],
        "model": "test-model",
    }
    resp.text = json.dumps(workflow_dict)
    return resp


# ---------------------------------------------------------------------------
# Retry loop tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
@pytest.mark.asyncio
async def test_first_attempt_success_returns_immediately():
    """If the first LLM response is valid, result is returned with exactly 1 LLM call."""
    from app.orchestrator.workflow_generator import WorkflowGenerator

    generator = WorkflowGenerator()
    mock_response = _make_gateway_response(VALID_WORKFLOW)

    with patch("app.orchestrator.workflow_generator.forward_chat_json", new_callable=AsyncMock) as mock_gateway:
        mock_gateway.return_value = mock_response
        result = await generator.generate_with_retry(
            prompt="Make a simple workflow",
            max_attempts=3,
        )

    assert mock_gateway.call_count == 1
    assert "nodes" in result
    assert len(result["nodes"]) == 3


@pytest.mark.unit
@pytest.mark.asyncio
async def test_second_attempt_success_after_first_failure():
    """If attempt 1 fails validation and attempt 2 succeeds, result returned, LLM called twice."""
    from app.orchestrator.workflow_generator import WorkflowGenerator

    generator = WorkflowGenerator()
    bad_response = _make_gateway_response(INVALID_WORKFLOW_NO_TRIGGER)
    good_response = _make_gateway_response(VALID_WORKFLOW)

    with patch("app.orchestrator.workflow_generator.forward_chat_json", new_callable=AsyncMock) as mock_gateway:
        mock_gateway.side_effect = [bad_response, good_response]
        result = await generator.generate_with_retry(
            prompt="Make a simple workflow",
            max_attempts=3,
        )

    assert mock_gateway.call_count == 2
    assert len(result["nodes"]) == 3


@pytest.mark.unit
@pytest.mark.asyncio
async def test_all_three_attempts_fail_raises_error():
    """After 3 failed attempts, WorkflowGenerationError is raised with the last error details."""
    from app.orchestrator.workflow_generator import WorkflowGenerator, WorkflowGenerationError

    generator = WorkflowGenerator()
    bad_response = _make_gateway_response(INVALID_WORKFLOW_NO_TRIGGER)

    with patch("app.orchestrator.workflow_generator.forward_chat_json", new_callable=AsyncMock) as mock_gateway:
        mock_gateway.return_value = bad_response
        with pytest.raises(WorkflowGenerationError) as exc_info:
            await generator.generate_with_retry(
                prompt="Make a workflow",
                max_attempts=3,
            )

    assert mock_gateway.call_count == 3
    assert "3 attempts" in str(exc_info.value)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_error_raised_includes_validation_error_and_hint():
    """WorkflowGenerationError from 3 failures must carry .validation_error and .hint attributes."""
    from app.orchestrator.workflow_generator import WorkflowGenerator, WorkflowGenerationError

    generator = WorkflowGenerator()
    bad_response = _make_gateway_response(INVALID_WORKFLOW_NO_TRIGGER)

    with patch("app.orchestrator.workflow_generator.forward_chat_json", new_callable=AsyncMock) as mock_gateway:
        mock_gateway.return_value = bad_response
        with pytest.raises(WorkflowGenerationError) as exc_info:
            await generator.generate_with_retry(prompt="Make a workflow", max_attempts=3)

    assert exc_info.value.validation_error is not None
    assert "trigger" in exc_info.value.validation_error.lower()
    assert exc_info.value.hint is not None


@pytest.mark.unit
@pytest.mark.asyncio
async def test_retry_prompt_includes_previous_error_message():
    """On retry, the previous ValidationError message is appended to the LLM prompt."""
    from app.orchestrator.workflow_generator import WorkflowGenerator

    generator = WorkflowGenerator()
    bad_response = _make_gateway_response(INVALID_WORKFLOW_NO_TRIGGER)
    good_response = _make_gateway_response(VALID_WORKFLOW)

    with patch("app.orchestrator.workflow_generator.forward_chat_json", new_callable=AsyncMock) as mock_gateway:
        mock_gateway.side_effect = [bad_response, good_response]
        await generator.generate_with_retry(prompt="Make a workflow", max_attempts=3)

    # Second call should include correction instruction in the user message
    second_call_payload = mock_gateway.call_args_list[1]
    payload = second_call_payload[1].get("payload") or second_call_payload[0][0]
    user_msg = payload["messages"][-1]["content"]
    assert "CORRECTION REQUIRED" in user_msg


@pytest.mark.unit
def test_celery_task_max_retries_is_zero():
    """Celery task must have max_retries=0 — application retry loop handles retries."""
    from app.tasks.workflow_gen_tasks import generate_workflow_task
    assert generate_workflow_task.max_retries == 0


# ---------------------------------------------------------------------------
# Few-shot cache tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
def test_few_shot_cache_populated_after_first_call():
    """Module-level few-shot cache is set after the first call to load_few_shot_examples()."""
    import app.orchestrator.workflow_generator as wg

    # Reset cache
    wg._few_shot_cache = []
    wg._few_shot_loaded_at = 0.0

    mock_examples = [
        {"name": "Test WF", "description": "Test", "workflowJson": VALID_WORKFLOW}
    ]

    with patch.object(wg, "_load_from_db", return_value=mock_examples):
        result = wg.load_few_shot_examples(force=True)

    assert len(result) > 0
    assert wg._few_shot_cache == result


@pytest.mark.unit
def test_few_shot_cache_not_refreshed_within_24_hours():
    """If cache was loaded less than 24h ago, it is not re-queried from the database."""
    import app.orchestrator.workflow_generator as wg

    cached = [{"name": "Cached", "description": "Cached", "workflowJson": VALID_WORKFLOW}]
    wg._few_shot_cache = cached
    wg._few_shot_loaded_at = time.monotonic()  # just now

    with patch.object(wg, "_load_from_db") as mock_db:
        result = wg.load_few_shot_examples()

    mock_db.assert_not_called()
    assert result == cached


@pytest.mark.unit
def test_few_shot_cache_refreshed_after_24_hours():
    """If 24+ hours have elapsed since last load, cache is refreshed from the database."""
    import app.orchestrator.workflow_generator as wg

    wg._few_shot_cache = [{"name": "Old", "description": "Old", "workflowJson": {}}]
    wg._few_shot_loaded_at = time.monotonic() - 90000  # 25 hours ago

    new_examples = [{"name": "New", "description": "New", "workflowJson": VALID_WORKFLOW}]
    with patch.object(wg, "_load_from_db", return_value=new_examples):
        result = wg.load_few_shot_examples()

    assert result[0]["name"] == "New"


@pytest.mark.unit
def test_few_shot_examples_within_token_budget():
    """Combined token count of loaded few-shot examples must be <= 3000."""
    import app.orchestrator.workflow_generator as wg

    result = wg._truncate_to_token_budget([
        {"name": "Ex1", "description": "D1", "workflowJson": VALID_WORKFLOW},
        {"name": "Ex2", "description": "D2", "workflowJson": VALID_WORKFLOW},
        {"name": "Ex3", "description": "D3", "workflowJson": VALID_WORKFLOW},
        {"name": "Ex4", "description": "D4", "workflowJson": VALID_WORKFLOW},
        {"name": "Ex5", "description": "D5", "workflowJson": VALID_WORKFLOW},
    ])

    total_tokens = len(json.dumps(result)) // 4
    assert total_tokens <= 3000


@pytest.mark.unit
def test_builtin_examples_removed_when_curated_loaded():
    """When few-shot examples are loaded, the built-in EXAMPLE A/B/C blocks are absent from the prompt."""
    import app.orchestrator.workflow_generator as wg

    curated = [
        {"name": "Curated WF", "description": "Test curated", "workflowJson": VALID_WORKFLOW}
    ]
    prompt = wg._build_system_prompt(curated)
    assert "EXAMPLE A" not in prompt
    assert "Curated WF" in prompt


@pytest.mark.unit
def test_builtin_examples_present_when_no_curated():
    """When no curated examples are available, the built-in EXAMPLE A/B/C blocks remain."""
    import app.orchestrator.workflow_generator as wg

    prompt = wg._build_system_prompt([])
    assert "EXAMPLE A" in prompt
