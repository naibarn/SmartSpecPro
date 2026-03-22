# Section 05: Celery Polling for fal.ai Tasks

## Overview

Add a fal.ai polling branch to `_recover_stuck_tasks_async()` in `media_tasks.py`. Detects fal.ai tasks by model ID matching, polls the fal.ai queue API, stores actual output metrics (`actual_duration`, `actual_resolution`) in `result_data` for credit reconciliation (section-08), and implements a 30-minute queue timeout.

**Depends on:** section-03 (FalAIProvider class), section-04 (gateway stores request_id in task.task_id)
**Blocks:** section-08 (provides actual_duration/actual_resolution in result_data)

## File to Modify

- `python-backend/app/tasks/media_tasks.py`

## Tests First

### `python-backend/tests/unit/services/test_fal_ai_celery_polling.py`

```python
# --- Detection ---
# Test: task.model "fal-ai/ltx-2.3/text-to-video" routed to fal.ai branch
# Test: task.model "fal-ai/lux-tts" routed to fal.ai branch
# Test: task.model "kie-ai-model" NOT routed to fal.ai branch

# --- Queue Status Polling ---
# Test: calls get_queue_status with task.model and task.task_id
# Test: provider config fetched via get_media_provider_key("fal_ai")

# --- COMPLETED ---
# Test: extracts video URL, sets task.status=COMPLETED
# Test: stores actual_duration and actual_resolution in result_data
# Test: resolution: width>=3840->"2160p", >=2560->"1440p", else->"1080p"
# Test: sets task.completed_at

# --- FAILED ---
# Test: sets task.status=FAILED, error_message sanitized (max 200 chars)

# --- IN_QUEUE / IN_PROGRESS ---
# Test: no status change

# --- Queue Timeout ---
# Test: task >30min in queue -> marked FAILED with timeout error
# Test: task <30min -> no change

# --- Provider Not Configured ---
# Test: logs warning and continues

# --- Resource Cleanup ---
# Test: aclose() called in finally block always

# --- Error Handling ---
# Test: 429 -> logs warning, continues
# Test: generic exception -> logs error, skips task (retry next cycle)
```

## Implementation Details

### 1. Branch Location

In `_recover_stuck_tasks_async()`, convert the `if/else` to `if/elif/else`:

```python
if task.model in BytePlusModelArkProvider.VIDEO_MODELS:
    # BytePlus (unchanged)
elif task.model in FalAIProvider.VIDEO_MODELS or task.model in FalAIProvider.AUDIO_MODELS:
    # NEW: fal.ai branch
else:
    # Kie.ai fallback (unchanged)
```

### 2. fal.ai Branch Logic

```python
# Lazy import (matching BytePlus pattern)
from app.llm_proxy.providers.fal_ai_provider import FalAIProvider
from app.services.media_provider_service import get_media_provider_key

# Fetch config
provider_config = await get_media_provider_key("fal_ai")
if not provider_config or not provider_config.get("apiKey"):
    logger.warning("recover_stuck_task_fal_ai_not_configured", task_id=task.id)
    continue

fal_client = None
try:
    fal_client = FalAIProvider(api_key=provider_config["apiKey"])

    # Check timeout first (avoid unnecessary API calls)
    FAL_QUEUE_TIMEOUT_MINUTES = 30
    age = (datetime.now(timezone.utc) - task.created_at).total_seconds() / 60
    if age > FAL_QUEUE_TIMEOUT_MINUTES:
        task.status = TaskStatus.FAILED
        task.error_message = "fal.ai queue timeout (>30 min)"
        task.completed_at = datetime.now(timezone.utc)
        failed_count += 1
        continue

    # Poll status
    status_response = await fal_client.get_queue_status(task.model, task.task_id)

    if status_response.get("status") == "COMPLETED":
        result = await fal_client.get_queue_result(task.model, task.task_id)
        task.status = TaskStatus.COMPLETED
        task.result_url = result["data"][0]["url"]
        task.result_data = {
            **result,
            "actual_duration": _extract_fal_duration(result),
            "actual_resolution": _derive_fal_resolution(result),
        }
        task.completed_at = datetime.now(timezone.utc)
        recovered_count += 1

    elif status_response.get("status") == "FAILED":
        error_msg = status_response.get("error", "Unknown error")
        task.status = TaskStatus.FAILED
        task.error_message = f"fal.ai failed: {str(error_msg)[:200]}"
        task.completed_at = datetime.now(timezone.utc)
        failed_count += 1

    # IN_QUEUE / IN_PROGRESS: skip, re-check next cycle

finally:
    if fal_client is not None:
        await fal_client.aclose()
```

### 3. Helper Functions

```python
def _derive_fal_resolution(result: dict) -> str:
    """Derive resolution from video width. Default: '1080p'."""
    width = result.get("video", {}).get("width") or result.get("width")
    if isinstance(width, (int, float)):
        if width >= 3840: return "2160p"
        if width >= 2560: return "1440p"
    return "1080p"

def _extract_fal_duration(result: dict) -> float | None:
    """Extract actual duration from fal.ai result."""
    duration = result.get("video", {}).get("duration") or result.get("duration")
    return float(duration) if duration is not None else None
```

### 4. Output Contract for Section-08

After completion, `task.result_data` contains:
```python
{
    "actual_duration": 8.5,        # float seconds (or None)
    "actual_resolution": "1080p",  # "1080p" | "1440p" | "2160p"
    # ... original fal.ai response
}
```

Node.js credit reconciliation reads `task.resultData.actual_duration` and `task.resultData.actual_resolution`.
