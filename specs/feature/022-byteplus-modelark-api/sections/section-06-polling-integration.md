I now have all the context I need to write the section. Let me compose the complete section content:

# Section 06: Polling Integration — BytePlus `recover_stuck_tasks` Extension

## Overview

This section extends the existing Celery beat task `recover_stuck_tasks` in `python-backend/app/tasks/media_tasks.py` to poll BytePlus ModelArk video tasks alongside existing Kie.ai tasks. It adds two new module-level helper functions (`_normalize_byteplus_task_state` and `_extract_byteplus_result_url`) and modifies the per-task loop inside `_recover_stuck_tasks_async` to route based on model name.

**This section depends on Section 03 (Python Adapter)** — the `BytePlusModelArkProvider` class must already be implemented before this section can be completed. The gateway routing (Section 05) can be implemented in parallel since this section only touches `media_tasks.py`.

---

## Background

### How `recover_stuck_tasks` Works Today

The Celery beat task `recover_stuck_tasks` runs every 2 minutes. It finds all `MediaTask` records with `status = PROCESSING` that have been running for at least 2 minutes and have a non-null `task_id` (the external provider task ID). For each such task, it currently:

1. Loads the Kie.ai provider config via `get_media_provider_key("kie_ai")`
2. Creates a `KieAIProvider` instance
3. Calls `provider.get_task_status(task.task_id)` to get the current status from the provider API
4. Normalizes the status via `_normalize_kie_task_state()` → `("success"/"fail"/"processing"/"unknown", raw_state)`
5. Extracts the result URL via `_extract_first_kie_result_url()` on success
6. Updates `MediaTask` to `COMPLETED`, `FAILED`, or leaves it `PROCESSING`

The function lives in `_recover_stuck_tasks_async()` starting at approximately line 811 of `python-backend/app/tasks/media_tasks.py`. The critical loop is the `for task in stuck_tasks:` block.

### BytePlus Video Task Flow

BytePlus video generation (`create_video_task`) returns a `provider_task_id` immediately. The Celery task (`generate_video_task`) stores this as `MediaTask.task_id` and leaves the task in `PROCESSING` state. The `recover_stuck_tasks` supervisor is the only mechanism that polls BytePlus to detect completion.

BytePlus task status values and their internal mappings:

| BytePlus status | Internal state | Action |
|---|---|---|
| `"succeeded"` | `"success"` | Extract URL, mark COMPLETED |
| `"failed"` | `"fail"` | Mark FAILED |
| `"cancelled"` | `"fail"` | Mark FAILED |
| `"queued"` | `"processing"` | No action, re-check next cycle |
| `"processing"` | `"processing"` | No action, re-check next cycle |

### BytePlus Status Response Shape

The status response from `GET /contents/generations/tasks/{task_id}` has this structure:

```json
{
  "id": "task-id-here",
  "status": "succeeded",
  "content": [
    {
      "type": "video_url",
      "video_url": {"url": "https://cdn.byteplus.example.com/output.mp4"}
    }
  ],
  "error": {"message": "Error description if failed"}
}
```

The `content` array may also contain `image_url` items. Only items starting with `"http"` are valid.

---

## Files to Modify

**Primary file:** `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_tasks.py`

**New test file:** `/home/dev/projects/SmartSpecPro/python-backend/tests/tasks/test_media_tasks_byteplus.py`

(Note: `tests/tasks/` directory may need to be created with an `__init__.py`.)

---

## Tests First

Create `/home/dev/projects/SmartSpecPro/python-backend/tests/tasks/test_media_tasks_byteplus.py`.

The tests use `unittest.mock` (`AsyncMock`, `MagicMock`, `patch`) — no `respx` needed because the provider's HTTP calls are fully mocked at the class level.

```python
"""
Tests for BytePlus polling integration in recover_stuck_tasks.
Tests _normalize_byteplus_task_state, _extract_byteplus_result_url,
and the BytePlus branch of _recover_stuck_tasks_async.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
import pytest_asyncio

from app.tasks.media_tasks import (
    _normalize_byteplus_task_state,
    _extract_byteplus_result_url,
)


# --- _normalize_byteplus_task_state ---

@pytest.mark.unit
@pytest.mark.parametrize("raw_status,expected_normalized,expected_raw", [
    ("succeeded", "success", "succeeded"),
    ("failed", "fail", "failed"),
    ("cancelled", "fail", "cancelled"),
    ("queued", "processing", "queued"),
    ("processing", "processing", "processing"),
    ("some_unknown_value", "unknown", "some_unknown_value"),
])
def test_normalize_byteplus_task_state(raw_status, expected_normalized, expected_raw):
    """_normalize_byteplus_task_state maps all known BytePlus status strings correctly."""
    response = {"id": "task-123", "status": raw_status}
    normalized, raw = _normalize_byteplus_task_state(response)
    assert normalized == expected_normalized
    assert raw == expected_raw


# --- _extract_byteplus_result_url ---

@pytest.mark.unit
def test_extract_byteplus_result_url_video():
    """Returns URL from a video_url content item."""
    response = {
        "content": [
            {"type": "video_url", "video_url": {"url": "https://cdn.example.com/video.mp4"}}
        ]
    }
    url = _extract_byteplus_result_url(response)
    assert url == "https://cdn.example.com/video.mp4"


@pytest.mark.unit
def test_extract_byteplus_result_url_image():
    """Returns URL from an image_url content item."""
    response = {
        "content": [
            {"type": "image_url", "image_url": {"url": "https://cdn.example.com/image.png"}}
        ]
    }
    url = _extract_byteplus_result_url(response)
    assert url == "https://cdn.example.com/image.png"


@pytest.mark.unit
def test_extract_byteplus_result_url_empty_content():
    """Returns None when content array is empty."""
    url = _extract_byteplus_result_url({"content": []})
    assert url is None


@pytest.mark.unit
def test_extract_byteplus_result_url_no_content_key():
    """Returns None when content key is absent."""
    url = _extract_byteplus_result_url({"status": "succeeded"})
    assert url is None


@pytest.mark.unit
def test_extract_byteplus_result_url_non_http():
    """Returns None when URL does not start with 'http'."""
    response = {
        "content": [
            {"type": "video_url", "video_url": {"url": "ftp://cdn.example.com/video.mp4"}}
        ]
    }
    url = _extract_byteplus_result_url(response)
    assert url is None


@pytest.mark.unit
def test_extract_byteplus_result_url_unknown_type():
    """Returns None for unknown content item types."""
    response = {
        "content": [
            {"type": "unknown_type", "data": {"url": "https://cdn.example.com/file"}}
        ]
    }
    url = _extract_byteplus_result_url(response)
    assert url is None


# --- recover_stuck_tasks integration (mocked) ---
# These tests mock at the class level so no real HTTP occurs.
# The BYTEPLUS_VIDEO_MODEL and KIE_AI_MODEL constants below must match
# actual model IDs from BytePlusModelArkProvider.VIDEO_MODELS.

BYTEPLUS_VIDEO_MODEL = "seedance-1-0-pro-250528"
KIE_AI_MODEL = "kling-2.6"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_dispatches_byteplus_for_seedance_model():
    """Tasks with a BytePlus VIDEO_MODEL are routed to BytePlusModelArkProvider."""
    # ... stub: assert BytePlusModelArkProvider.get_task_status is called for the task
    pass


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_dispatches_kieai_for_non_byteplus_model():
    """Tasks with a non-BytePlus model still go through the KieAI path (no regression)."""
    # ... stub: assert KieAIProvider.get_task_status is called, BytePlus provider is NOT called
    pass


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_completed_on_byteplus_succeeded():
    """Task is marked COMPLETED when BytePlus status is 'succeeded' and URL is extracted."""
    # ... stub: mock get_task_status to return {"status": "succeeded", "content": [...]}
    #           assert task.status set to TaskStatus.COMPLETED and task.result_url set
    pass


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_failed_on_byteplus_failed():
    """Task is marked FAILED when BytePlus status is 'failed'."""
    # ... stub: mock get_task_status returning {"status": "failed", "error": {"message": "Quota exceeded"}}
    #           assert task.status set to TaskStatus.FAILED, task.error_message contains the message
    pass


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_no_change_on_byteplus_processing():
    """Task remains PROCESSING when BytePlus status is 'queued' or 'processing'."""
    # ... stub: mock get_task_status returning {"status": "queued"}
    #           assert task.status is NOT updated (still PROCESSING)
    pass


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_skip_when_byteplus_not_configured():
    """When get_media_provider_key('byteplus_modelark') returns None, task is skipped with warning log."""
    # ... stub: mock get_media_provider_key to return None
    #           assert task.status unchanged, warning logged
    pass


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_no_fail_on_byteplus_429():
    """HTTP 429 from BytePlus does NOT mark the task as FAILED — task is skipped for this cycle."""
    # ... stub: mock get_task_status to raise httpx.HTTPStatusError with status_code=429
    #           assert task.status is still PROCESSING (not FAILED)
    pass


@pytest.mark.unit
@pytest.mark.asyncio
async def test_recover_stuck_tasks_aclose_called_after_byteplus_check():
    """BytePlusModelArkProvider.aclose() is called in finally block after every task check."""
    # ... stub: assert aclose() called even when get_task_status raises an exception
    pass
```

---

## Implementation

### Step 1 — Add Helper Functions to `media_tasks.py`

Add the two new helper functions to `/home/dev/projects/SmartSpecPro/python-backend/app/tasks/media_tasks.py` immediately after the existing `_normalize_kie_task_state` function (around line 141). These are pure functions with no side effects, easy to test in isolation.

**`_normalize_byteplus_task_state`** — maps BytePlus-specific status strings to the internal `(normalized, raw)` tuple format used throughout `_recover_stuck_tasks_async`:

```python
def _normalize_byteplus_task_state(status_response: dict) -> tuple[str, str]:
    """Normalize BytePlus task status to internal state.

    Returns a (normalized_state, raw_status) tuple where normalized_state is
    one of: 'success', 'fail', 'processing', 'unknown'.

    BytePlus status values: succeeded, failed, cancelled, queued, processing.
    """
    raw_status = status_response.get("status", "")
    if raw_status == "succeeded":
        return "success", "succeeded"
    if raw_status in ("failed", "cancelled"):
        return "fail", raw_status
    if raw_status in ("queued", "processing"):
        return "processing", raw_status
    return "unknown", raw_status
```

**`_extract_byteplus_result_url`** — extracts the first valid HTTP URL from the BytePlus `content` array:

```python
def _extract_byteplus_result_url(status_response: dict) -> Optional[str]:
    """Extract result URL from BytePlus task status response.

    Iterates over status_response['content'] items. Returns the first URL found
    in a 'video_url' or 'image_url' item that starts with 'http'. Returns None
    if no valid URL is found.
    """
    for item in status_response.get("content", []):
        item_type = item.get("type")
        if item_type == "video_url":
            url = item.get("video_url", {}).get("url", "")
            if url.startswith("http"):
                return url
        elif item_type == "image_url":
            url = item.get("image_url", {}).get("url", "")
            if url.startswith("http"):
                return url
    return None
```

### Step 2 — Extend `_recover_stuck_tasks_async`

Modify the `for task in stuck_tasks:` loop in `_recover_stuck_tasks_async`. The change is a model-based provider dispatch added **before** the existing Kie.ai provider initialization code.

The current per-task code begins at approximately line 842 and immediately calls `get_media_provider_key("kie_ai")`. The updated structure should be:

```python
for task in stuck_tasks:
    try:
        logger.info(
            "recover_stuck_task_polling",
            task_id=task.id,
            external_task_id=task.task_id,
            model=task.model,
            stuck_since=task.started_at.isoformat() if task.started_at else None,
        )

        from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider

        if task.model in BytePlusModelArkProvider.VIDEO_MODELS:
            # --- BytePlus polling branch ---
            from app.services.media_provider_service import get_media_provider_key
            provider_config = await get_media_provider_key("byteplus_modelark")
            if not provider_config or not provider_config.get("apiKey"):
                logger.warning(
                    "recover_stuck_task_byteplus_not_configured",
                    task_id=task.id,
                )
                continue

            byteplus_client = BytePlusModelArkProvider(
                api_key=provider_config["apiKey"],
                base_url=provider_config.get("baseUrl"),
            )
            try:
                import httpx
                try:
                    status_response = await byteplus_client.get_task_status(task.task_id)
                except httpx.HTTPStatusError as http_err:
                    if http_err.response.status_code == 429:
                        logger.warning(
                            "recover_stuck_task_byteplus_rate_limited",
                            task_id=task.id,
                            external_task_id=task.task_id,
                        )
                        continue
                    raise

                task_state, raw_state = _normalize_byteplus_task_state(status_response)
                logger.info(
                    "recover_stuck_task_byteplus_status",
                    task_id=task.id,
                    task_state=task_state,
                    raw_state=raw_state,
                )

                if task_state == "success":
                    result_url = _extract_byteplus_result_url(status_response)
                    if result_url:
                        task.status = TaskStatus.COMPLETED
                        task.result_url = result_url
                        task.result_data = status_response
                        task.completed_at = datetime.now(timezone.utc)
                        recovered_count += 1
                        logger.info(
                            "recover_stuck_task_byteplus_completed",
                            task_id=task.id,
                            result_url=result_url,
                        )
                    else:
                        logger.warning(
                            "recover_stuck_task_byteplus_success_no_url",
                            task_id=task.id,
                        )

                elif task_state == "fail":
                    error_msg = (
                        status_response.get("error", {}).get("message")
                        or "Task failed"
                    )
                    task.status = TaskStatus.FAILED
                    task.error_message = f"BytePlus failed: {error_msg}"
                    task.result_data = status_response
                    task.completed_at = datetime.now(timezone.utc)
                    failed_count += 1
                    logger.warning(
                        "recover_stuck_task_byteplus_failed",
                        task_id=task.id,
                        error=error_msg,
                    )

                # "processing"/"unknown": do nothing, re-check next cycle

            finally:
                await byteplus_client.aclose()

        else:
            # --- Existing Kie.ai polling branch (unchanged) ---
            from app.services.media_provider_service import get_media_provider_key
            provider_config = await get_media_provider_key("kie_ai")
            # ... rest of existing KieAI code unchanged ...
```

**Important:** The `from datetime import timezone` import is already present in `_recover_stuck_tasks_async` (line 818). No new module-level imports are needed — the `BytePlusModelArkProvider` import is done inline inside the `if` branch (same pattern as the KieAI provider import at line 859).

### Step 3 — Structural Notes

- The `recovered_count` and `failed_count` accumulators are shared between both branches — BytePlus completions and failures increment the same counters
- The final `await db.commit()` at the end of the function handles both Kie.ai and BytePlus state updates
- No changes to the `recover_stuck_tasks` Celery task itself (only the async implementation function)
- No new Celery beat schedule entries are needed — BytePlus tasks poll on the existing 2-minute cycle

---

## Dependency: Section 03 Interface

This section calls `BytePlusModelArkProvider` in the following ways:

```python
# Detection
from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider
if task.model in BytePlusModelArkProvider.VIDEO_MODELS:  # set of 4 model IDs

# Instantiation
client = BytePlusModelArkProvider(api_key="...", base_url=None)

# Status poll (30s per-request timeout handled inside the method)
status_dict = await client.get_task_status(task_id_string)

# Resource cleanup
await client.aclose()
```

`BytePlusModelArkProvider.VIDEO_MODELS` must be a class-level `set` containing these 4 model IDs:
- `"seedance-1-0-pro-250528"`
- `"seedance-1-0-pro-fast-251015"`
- `"seedance-1-0-lite-t2v-250428"`
- `"seedance-1-0-lite-i2v-250428"`

---

## Verification Steps

After implementation:

1. Run the new test file:
   ```bash
   cd /home/dev/projects/SmartSpecPro/python-backend
   uv run pytest tests/tasks/test_media_tasks_byteplus.py -v
   ```

2. Run all tests with the `byteplus` keyword to catch cross-module issues:
   ```bash
   uv run pytest tests/ -k "byteplus" -v
   ```

3. Run the full test suite to check for regressions (particularly the existing `recover_stuck_tasks` behavior):
   ```bash
   uv run pytest tests/ -v
   ```

4. Check code quality:
   ```bash
   ruff check app/tasks/media_tasks.py
   mypy app/tasks/media_tasks.py
   ```

---

## Security Checklist

- The `aclose()` call is in a `try/finally` block — it executes even if `get_task_status` raises
- HTTP 429 responses from BytePlus do not mark tasks as `FAILED` — they are logged and skipped (`continue`)
  - Note: `continue` inside inner `try/except` still triggers outer `try/finally`, so `aclose()` fires (documented with inline comment)
- The API key is passed to `BytePlusModelArkProvider.__init__` which must not log it (covered by Section 04 tests)
- Error messages from `status_response["error"]["message"]` are truncated to 200 characters: `f"BytePlus failed: {error_msg[:200]}"`

## Implementation Notes (Actual vs Planned)

### Deviations from plan
- Test patch path: `"app.tasks.media_tasks.AsyncSessionLocal"` (not `"app.core.database.AsyncSessionLocal"` as shown in plan stubs) — `AsyncSessionLocal` is a module-level import in `media_tasks.py`, so must be patched at the import site
- `error_msg` truncation: `[:200]` applied as required by security checklist (was missing in plan's code snippet)
- Added `continue` clarity comment explaining `finally` semantics for the 429 rate-limit path

### Actual files created/modified
- **Modified**: `python-backend/app/tasks/media_tasks.py`
  - Added `_normalize_byteplus_task_state()` after `_normalize_kie_task_state()` (~line 142)
  - Added `_extract_byteplus_result_url()` after `_normalize_byteplus_task_state()` (~line 162)
  - Modified `_recover_stuck_tasks_async()` loop: BytePlus branch dispatched before Kie.ai branch using `BytePlusModelArkProvider.VIDEO_MODELS` membership check
- **Created**: `python-backend/tests/tasks/test_media_tasks_byteplus.py`
  - 22 tests (7 unit + 15 integration)

### Final test count: 22 tests, all passing