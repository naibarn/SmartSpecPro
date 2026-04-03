# Section 03 Diff Summary

Files touched:

- `python-backend/app/llm_proxy/providers/wavespeed_media_provider.py`
- `python-backend/app/llm_proxy/gateway_unified.py`
- `python-backend/app/services/media_provider_service.py`
- `python-backend/app/tasks/media_tasks.py`
- `python-backend/app/tasks/__init__.py`
- `python-backend/app/core/celery_app.py`

Summary:

- Added WaveSpeed submit/poll provider support with strict final-URL validation.
- Routed launch-model video generation through the WaveSpeed adapter and canonical provider lookup.
- Persisted restart-safe submission metadata and added a dedicated async polling task with bounded retry/backoff behavior.
