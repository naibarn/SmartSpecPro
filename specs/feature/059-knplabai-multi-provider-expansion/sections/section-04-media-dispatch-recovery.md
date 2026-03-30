# Section 04: Media Dispatch and Task Recovery

## Purpose

Wire KNPLabs into the runtime media gateway and make sure long-running tasks can be recovered if a worker restarts.

This section bridges the database catalog and the actual execution path.

## Files

- `python-backend/app/llm_proxy/gateway_unified.py`
- `python-backend/app/tasks/media_tasks.py`
- `python-backend/app/api/v1/media_generation.py`
- `python-backend/app/services/media_provider_service.py`
- `python-backend/app/services/media_task_service.py`

## Implementation Notes

1. Add KNPLabs routing branches to the media gateway for image, video, and audio.
2. Preserve the existing Kie.ai, fal.ai, BytePlus, and UVoice flows exactly as they are.
3. Route by a combination of stored provider name and normalized model ID.
4. In the task recovery loop, add a KNPLabs branch that can poll incomplete tasks and update the DB when a result becomes available.
5. Keep result URLs validated before they are saved.
6. Store KNPLabs-specific task payloads inside `result_data` so recovery has enough data to replay status checks later.
7. Keep the recovery loop bounded and resilient to transient 429/5xx failures.

## Acceptance Criteria

- KNPLabs tasks can be submitted and later recovered.
- Existing provider behavior does not change.
- Stuck KNPLabs tasks do not disappear without a terminal state.

