diff --git a/python-backend/app/tasks/media_tasks.py b/python-backend/app/tasks/media_tasks.py
index 7811530..607d23c 100644
--- a/python-backend/app/tasks/media_tasks.py
+++ b/python-backend/app/tasks/media_tasks.py
@@ -140,6 +140,44 @@ def _normalize_kie_task_state(status_response: dict) -> tuple[str, str]:
     return "unknown", ""
 
 
+def _normalize_byteplus_task_state(status_response: dict) -> tuple[str, str]:
+    """Normalize BytePlus task status to internal state.
+
+    Returns a (normalized_state, raw_status) tuple where normalized_state is
+    one of: 'success', 'fail', 'processing', 'unknown'.
+
+    BytePlus status values: succeeded, failed, cancelled, queued, processing.
+    """
+    raw_status = status_response.get("status", "")
+    if raw_status == "succeeded":
+        return "success", "succeeded"
+    if raw_status in ("failed", "cancelled"):
+        return "fail", raw_status
+    if raw_status in ("queued", "processing"):
+        return "processing", raw_status
+    return "unknown", raw_status
+
+
+def _extract_byteplus_result_url(status_response: dict) -> Optional[str]:
+    """Extract result URL from BytePlus task status response.
+
+    Iterates over status_response['content'] items. Returns the first URL found
+    in a 'video_url' or 'image_url' item that starts with 'http'. Returns None
+    if no valid URL is found.
+    """
+    for item in status_response.get("content", []):
+        item_type = item.get("type")
+        if item_type == "video_url":
+            url = item.get("video_url", {}).get("url", "")
+            if url.startswith("http"):
+                return url
+        elif item_type == "image_url":
+            url = item.get("image_url", {}).get("url", "")
+            if url.startswith("http"):
+                return url
+    return None
+
+
 def _extract_url_from_value(value: Any) -> Optional[str]:
     """Extract a media URL from common provider response value shapes."""
     if isinstance(value, str) and value.startswith("http"):
@@ -841,121 +879,204 @@ async def _recover_stuck_tasks_async():
 
             for task in stuck_tasks:
                 try:
-                    # Poll Kie.ai for actual status
                     logger.info(
                         "recover_stuck_task_polling",
                         task_id=task.id,
                         external_task_id=task.task_id,
-                        stuck_since=task.started_at.isoformat() if task.started_at else None
+                        model=task.model,
+                        stuck_since=task.started_at.isoformat() if task.started_at else None,
                     )
 
-                    # Get Kie.ai provider config from shared media_providers table
-                    from app.services.media_provider_service import get_media_provider_key
-                    provider_config = await get_media_provider_key("kie_ai")
-                    if not provider_config or not provider_config.get("apiKey"):
-                        logger.warning("recover_stuck_task_provider_not_configured", task_id=task.id)
-                        continue
-
-                    from app.llm_proxy.providers.kie_ai_provider import KieAIProvider
-                    provider = KieAIProvider(
-                        api_key=provider_config["apiKey"],
-                        base_url=provider_config.get("baseUrl") or "https://api.kie.ai/api/v1",
-                        callback_url=provider_config.get("callbackUrl"),
-                    )
+                    from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider
 
-                    preferred_query_endpoint = None
-
-                    task_parameters = task.parameters
-                    if isinstance(task_parameters, str):
-                        try:
-                            task_parameters = json.loads(task_parameters)
-                        except json.JSONDecodeError:
-                            task_parameters = {}
-
-                    if isinstance(task_parameters, dict):
-                        api_cfg = task_parameters.get("api_config")
-                        if isinstance(api_cfg, dict):
-                            preferred_query_endpoint = (
-                                api_cfg.get("query_endpoint")
-                                or api_cfg.get("status_endpoint")
-                                or api_cfg.get("api_query_endpoint")
-                                or api_cfg.get("api_status_endpoint")
+                    if task.model in BytePlusModelArkProvider.VIDEO_MODELS:
+                        # --- BytePlus polling branch ---
+                        from app.services.media_provider_service import get_media_provider_key
+                        provider_config = await get_media_provider_key("byteplus_modelark")
+                        if not provider_config or not provider_config.get("apiKey"):
+                            logger.warning(
+                                "recover_stuck_task_byteplus_not_configured",
+                                task_id=task.id,
                             )
+                            continue
 
-                    if not preferred_query_endpoint and task.model:
+                        byteplus_client = None
                         try:
-                            model_result = await db.execute(
-                                text('SELECT "configJson" FROM media_models WHERE "modelId" = :model_id LIMIT 1'),
-                                {"model_id": task.model}
+                            byteplus_client = BytePlusModelArkProvider(
+                                api_key=provider_config["apiKey"],
+                                base_url=provider_config.get("baseUrl"),
                             )
-                            model_row = model_result.fetchone()
-                            if model_row:
-                                preferred_query_endpoint = _extract_model_query_endpoint(model_row[0])
-                        except Exception as lookup_error:
-                            logger.warning(
-                                "recover_stuck_task_query_endpoint_lookup_failed",
+                            import httpx
+                            try:
+                                status_response = await byteplus_client.get_task_status(task.task_id)
+                            except httpx.HTTPStatusError as http_err:
+                                if http_err.response.status_code == 429:
+                                    logger.warning(
+                                        "recover_stuck_task_byteplus_rate_limited",
+                                        task_id=task.id,
+                                        external_task_id=task.task_id,
+                                    )
+                                    continue
+                                raise
+
+                            task_state, raw_state = _normalize_byteplus_task_state(status_response)
+                            logger.info(
+                                "recover_stuck_task_byteplus_status",
                                 task_id=task.id,
-                                model=task.model,
-                                error=str(lookup_error),
+                                task_state=task_state,
+                                raw_state=raw_state,
                             )
 
-                    # Poll for current status (single check, no wait)
-                    status_response = await provider.get_task_status(
-                        task.task_id,
-                        preferred_status_endpoint=preferred_query_endpoint,
-                    )
-                    task_state, raw_state = _normalize_kie_task_state(status_response)
+                            if task_state == "success":
+                                result_url = _extract_byteplus_result_url(status_response)
+                                if result_url:
+                                    task.status = TaskStatus.COMPLETED
+                                    task.result_url = result_url
+                                    task.result_data = status_response
+                                    task.completed_at = datetime.now(timezone.utc)
+                                    recovered_count += 1
+                                    logger.info(
+                                        "recover_stuck_task_byteplus_completed",
+                                        task_id=task.id,
+                                        result_url=result_url,
+                                    )
+                                else:
+                                    logger.warning(
+                                        "recover_stuck_task_byteplus_success_no_url",
+                                        task_id=task.id,
+                                    )
+
+                            elif task_state == "fail":
+                                error_msg = (
+                                    (status_response.get("error") or {}).get("message")
+                                    or "Task failed"
+                                )
+                                task.status = TaskStatus.FAILED
+                                task.error_message = f"BytePlus failed: {error_msg}"
+                                task.result_data = status_response
+                                task.completed_at = datetime.now(timezone.utc)
+                                failed_count += 1
+                                logger.warning(
+                                    "recover_stuck_task_byteplus_failed",
+                                    task_id=task.id,
+                                    error=error_msg,
+                                )
+
+                            # "processing"/"unknown": do nothing, re-check next cycle
+
+                        finally:
+                            if byteplus_client is not None:
+                                await byteplus_client.aclose()
 
-                    logger.info(
-                        "recover_stuck_task_status",
-                        task_id=task.id,
-                        task_state=task_state,
-                        raw_state=raw_state,
-                        preferred_query_endpoint=preferred_query_endpoint,
-                    )
-
-                    if task_state == "success":
-                        result_url = _extract_first_kie_result_url(status_response)
-                        if result_url:
-                            task.status = TaskStatus.COMPLETED
-                            task.result_url = result_url
-                            task.result_data = status_response
-                            task.completed_at = datetime.now(timezone.utc)
-                            recovered_count += 1
-                            logger.info("recover_stuck_task_completed", task_id=task.id, result_url=result_url)
-                        else:
-                            logger.warning(
-                                "recover_stuck_task_success_without_result_url",
-                                task_id=task.id,
-                                external_task_id=task.task_id,
-                            )
+                    else:
+                        # --- Kie.ai polling branch ---
+                        # Get Kie.ai provider config from shared media_providers table
+                        from app.services.media_provider_service import get_media_provider_key
+                        provider_config = await get_media_provider_key("kie_ai")
+                        if not provider_config or not provider_config.get("apiKey"):
+                            logger.warning("recover_stuck_task_provider_not_configured", task_id=task.id)
+                            continue
+
+                        from app.llm_proxy.providers.kie_ai_provider import KieAIProvider
+                        provider = KieAIProvider(
+                            api_key=provider_config["apiKey"],
+                            base_url=provider_config.get("baseUrl") or "https://api.kie.ai/api/v1",
+                            callback_url=provider_config.get("callbackUrl"),
+                        )
 
-                    elif task_state == "fail":
-                        # Task failed on provider side
-                        data = status_response.get("data", {}) if isinstance(status_response, dict) else {}
-                        error_msg = (
-                            status_response.get("msg")
-                            or status_response.get("message")
-                            or data.get("error")
-                            or data.get("errorMessage")
-                            or "Unknown error from provider"
+                        preferred_query_endpoint = None
+
+                        task_parameters = task.parameters
+                        if isinstance(task_parameters, str):
+                            try:
+                                task_parameters = json.loads(task_parameters)
+                            except json.JSONDecodeError:
+                                task_parameters = {}
+
+                        if isinstance(task_parameters, dict):
+                            api_cfg = task_parameters.get("api_config")
+                            if isinstance(api_cfg, dict):
+                                preferred_query_endpoint = (
+                                    api_cfg.get("query_endpoint")
+                                    or api_cfg.get("status_endpoint")
+                                    or api_cfg.get("api_query_endpoint")
+                                    or api_cfg.get("api_status_endpoint")
+                                )
+
+                        if not preferred_query_endpoint and task.model:
+                            try:
+                                model_result = await db.execute(
+                                    text('SELECT "configJson" FROM media_models WHERE "modelId" = :model_id LIMIT 1'),
+                                    {"model_id": task.model}
+                                )
+                                model_row = model_result.fetchone()
+                                if model_row:
+                                    preferred_query_endpoint = _extract_model_query_endpoint(model_row[0])
+                            except Exception as lookup_error:
+                                logger.warning(
+                                    "recover_stuck_task_query_endpoint_lookup_failed",
+                                    task_id=task.id,
+                                    model=task.model,
+                                    error=str(lookup_error),
+                                )
+
+                        # Poll for current status (single check, no wait)
+                        status_response = await provider.get_task_status(
+                            task.task_id,
+                            preferred_status_endpoint=preferred_query_endpoint,
                         )
-                        task.status = TaskStatus.FAILED
-                        task.error_message = f"Provider failed: {error_msg}"
-                        task.result_data = status_response
-                        task.completed_at = datetime.now(timezone.utc)
-                        failed_count += 1
-                        logger.warning("recover_stuck_task_failed", task_id=task.id, error=error_msg)
+                        task_state, raw_state = _normalize_kie_task_state(status_response)
 
-                    else:
-                        # Still processing or unknown: keep task as-is and retry on next cycle.
                         logger.info(
-                            "recover_stuck_task_still_processing",
+                            "recover_stuck_task_status",
                             task_id=task.id,
                             task_state=task_state,
                             raw_state=raw_state,
+                            preferred_query_endpoint=preferred_query_endpoint,
                         )
 
+                        if task_state == "success":
+                            result_url = _extract_first_kie_result_url(status_response)
+                            if result_url:
+                                task.status = TaskStatus.COMPLETED
+                                task.result_url = result_url
+                                task.result_data = status_response
+                                task.completed_at = datetime.now(timezone.utc)
+                                recovered_count += 1
+                                logger.info("recover_stuck_task_completed", task_id=task.id, result_url=result_url)
+                            else:
+                                logger.warning(
+                                    "recover_stuck_task_success_without_result_url",
+                                    task_id=task.id,
+                                    external_task_id=task.task_id,
+                                )
+
+                        elif task_state == "fail":
+                            # Task failed on provider side
+                            data = status_response.get("data", {}) if isinstance(status_response, dict) else {}
+                            error_msg = (
+                                status_response.get("msg")
+                                or status_response.get("message")
+                                or data.get("error")
+                                or data.get("errorMessage")
+                                or "Unknown error from provider"
+                            )
+                            task.status = TaskStatus.FAILED
+                            task.error_message = f"Provider failed: {error_msg}"
+                            task.result_data = status_response
+                            task.completed_at = datetime.now(timezone.utc)
+                            failed_count += 1
+                            logger.warning("recover_stuck_task_failed", task_id=task.id, error=error_msg)
+
+                        else:
+                            # Still processing or unknown: keep task as-is and retry on next cycle.
+                            logger.info(
+                                "recover_stuck_task_still_processing",
+                                task_id=task.id,
+                                task_state=task_state,
+                                raw_state=raw_state,
+                            )
+
                 except Exception as task_error:
                     logger.error(
                         "recover_stuck_task_error",
diff --git a/python-backend/tests/tasks/test_media_tasks_byteplus.py b/python-backend/tests/tasks/test_media_tasks_byteplus.py
new file mode 100644
index 0000000..5e98257
--- /dev/null
+++ b/python-backend/tests/tasks/test_media_tasks_byteplus.py
@@ -0,0 +1,366 @@
+"""
+Tests for BytePlus polling integration in recover_stuck_tasks.
+Tests _normalize_byteplus_task_state, _extract_byteplus_result_url,
+and the BytePlus branch of _recover_stuck_tasks_async.
+"""
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+from datetime import datetime, timezone, timedelta
+
+from app.tasks.media_tasks import (
+    _normalize_byteplus_task_state,
+    _extract_byteplus_result_url,
+)
+from app.models.media_task import TaskStatus
+
+
+# --- _normalize_byteplus_task_state ---
+
+@pytest.mark.unit
+@pytest.mark.parametrize("raw_status,expected_normalized,expected_raw", [
+    ("succeeded", "success", "succeeded"),
+    ("failed", "fail", "failed"),
+    ("cancelled", "fail", "cancelled"),
+    ("queued", "processing", "queued"),
+    ("processing", "processing", "processing"),
+    ("some_unknown_value", "unknown", "some_unknown_value"),
+])
+def test_normalize_byteplus_task_state(raw_status, expected_normalized, expected_raw):
+    """_normalize_byteplus_task_state maps all known BytePlus status strings correctly."""
+    response = {"id": "task-123", "status": raw_status}
+    normalized, raw = _normalize_byteplus_task_state(response)
+    assert normalized == expected_normalized
+    assert raw == expected_raw
+
+
+def test_normalize_byteplus_task_state_missing_status():
+    """Returns 'unknown' when status key is absent."""
+    normalized, raw = _normalize_byteplus_task_state({"id": "task-123"})
+    assert normalized == "unknown"
+    assert raw == ""
+
+
+# --- _extract_byteplus_result_url ---
+
+@pytest.mark.unit
+def test_extract_byteplus_result_url_video():
+    """Returns URL from a video_url content item."""
+    response = {
+        "content": [
+            {"type": "video_url", "video_url": {"url": "https://cdn.example.com/video.mp4"}}
+        ]
+    }
+    url = _extract_byteplus_result_url(response)
+    assert url == "https://cdn.example.com/video.mp4"
+
+
+@pytest.mark.unit
+def test_extract_byteplus_result_url_image():
+    """Returns URL from an image_url content item."""
+    response = {
+        "content": [
+            {"type": "image_url", "image_url": {"url": "https://cdn.example.com/image.png"}}
+        ]
+    }
+    url = _extract_byteplus_result_url(response)
+    assert url == "https://cdn.example.com/image.png"
+
+
+@pytest.mark.unit
+def test_extract_byteplus_result_url_empty_content():
+    """Returns None when content array is empty."""
+    url = _extract_byteplus_result_url({"content": []})
+    assert url is None
+
+
+@pytest.mark.unit
+def test_extract_byteplus_result_url_no_content_key():
+    """Returns None when content key is absent."""
+    url = _extract_byteplus_result_url({"status": "succeeded"})
+    assert url is None
+
+
+@pytest.mark.unit
+def test_extract_byteplus_result_url_non_http():
+    """Returns None when URL does not start with 'http'."""
+    response = {
+        "content": [
+            {"type": "video_url", "video_url": {"url": "ftp://cdn.example.com/video.mp4"}}
+        ]
+    }
+    url = _extract_byteplus_result_url(response)
+    assert url is None
+
+
+@pytest.mark.unit
+def test_extract_byteplus_result_url_unknown_type():
+    """Returns None for unknown content item types."""
+    response = {
+        "content": [
+            {"type": "unknown_type", "data": {"url": "https://cdn.example.com/file"}}
+        ]
+    }
+    url = _extract_byteplus_result_url(response)
+    assert url is None
+
+
+# --- _recover_stuck_tasks_async integration (mocked) ---
+
+BYTEPLUS_VIDEO_MODEL = "seedance-1-0-pro-250528"
+KIE_AI_MODEL = "kling-2.6"
+BYTEPLUS_PATCH = "app.llm_proxy.providers.byteplus_modelark_provider.BytePlusModelArkProvider"
+GET_PROVIDER_KEY_PATCH = "app.services.media_provider_service.get_media_provider_key"
+
+
+def _make_stuck_task(model: str, task_id: str = "ext-task-001", internal_id: int = 1) -> MagicMock:
+    """Create a mock MediaTask in PROCESSING state."""
+    task = MagicMock()
+    task.id = internal_id
+    task.task_id = task_id
+    task.model = model
+    task.status = TaskStatus.PROCESSING
+    task.started_at = datetime.now(timezone.utc) - timedelta(minutes=10)
+    task.result_url = None
+    task.error_message = None
+    task.result_data = None
+    task.completed_at = None
+    task.parameters = None
+    return task
+
+
+def _make_byteplus_class_mock(instance: MagicMock) -> MagicMock:
+    """Create a mock BytePlusModelArkProvider class with real VIDEO_MODELS set."""
+    from app.llm_proxy.providers.byteplus_modelark_provider import BytePlusModelArkProvider as Real
+    cls = MagicMock()
+    cls.VIDEO_MODELS = Real.VIDEO_MODELS
+    cls.IMAGE_MODELS = Real.IMAGE_MODELS
+    cls.return_value = instance
+    return cls
+
+
+def _make_byteplus_provider_mock(status_response: dict | None = None, raise_exc: Exception | None = None) -> MagicMock:
+    """Create a mock BytePlusModelArkProvider instance."""
+    provider = MagicMock()
+    if raise_exc is not None:
+        provider.get_task_status = AsyncMock(side_effect=raise_exc)
+    else:
+        provider.get_task_status = AsyncMock(return_value=status_response or {})
+    provider.aclose = AsyncMock()
+    return provider
+
+
+async def _run_recover_async():
+    """Import and run _recover_stuck_tasks_async."""
+    from app.tasks.media_tasks import _recover_stuck_tasks_async
+    return await _recover_stuck_tasks_async()
+
+
+@pytest.fixture
+def mock_db_session():
+    """Mock AsyncSession that returns configurable stuck tasks."""
+    session = AsyncMock()
+    session.commit = AsyncMock()
+    session.execute = AsyncMock()
+    return session
+
+
+def _setup_db_session(mock_session: MagicMock, tasks: list) -> None:
+    """Configure mock DB session to return given tasks from stuck task query."""
+    result_mock = MagicMock()
+    result_mock.scalars.return_value.all.return_value = tasks
+    mock_session.execute.return_value = result_mock
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_recover_stuck_tasks_dispatches_byteplus_for_seedance_model():
+    """Tasks with a BytePlus VIDEO_MODEL are routed to BytePlusModelArkProvider."""
+    task = _make_stuck_task(BYTEPLUS_VIDEO_MODEL)
+    bp_provider = _make_byteplus_provider_mock(
+        status_response={"status": "processing"}
+    )
+    bp_cls_mock = _make_byteplus_class_mock(bp_provider)
+
+    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
+         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
+         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "key", "baseUrl": None}):
+        mock_session = AsyncMock()
+        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
+        mock_session.__aexit__ = AsyncMock(return_value=False)
+        _setup_db_session(mock_session, [task])
+        mock_session_cls.return_value = mock_session
+        await _run_recover_async()
+
+    bp_provider.get_task_status.assert_awaited_once_with(task.task_id)
+    bp_provider.aclose.assert_awaited_once()
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_recover_stuck_tasks_dispatches_kieai_for_non_byteplus_model():
+    """Tasks with a non-BytePlus model use the Kie.ai path — BytePlus provider not called."""
+    task = _make_stuck_task(KIE_AI_MODEL)
+    bp_cls_mock = _make_byteplus_class_mock(MagicMock())
+
+    kie_provider = MagicMock()
+    kie_provider.get_task_status = AsyncMock(return_value={"status": "processing"})
+
+    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
+         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
+         patch("app.llm_proxy.providers.kie_ai_provider.KieAIProvider", return_value=kie_provider), \
+         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "kie-key", "baseUrl": None}):
+        mock_session = AsyncMock()
+        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
+        mock_session.__aexit__ = AsyncMock(return_value=False)
+        _setup_db_session(mock_session, [task])
+        mock_session_cls.return_value = mock_session
+        await _run_recover_async()
+
+    # BytePlus class was never instantiated
+    bp_cls_mock.assert_not_called()
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_recover_stuck_tasks_completed_on_byteplus_succeeded():
+    """Task is marked COMPLETED when BytePlus status is 'succeeded' and URL is extracted."""
+    task = _make_stuck_task(BYTEPLUS_VIDEO_MODEL)
+    status_response = {
+        "status": "succeeded",
+        "content": [{"type": "video_url", "video_url": {"url": "https://cdn.example.com/output.mp4"}}],
+    }
+    bp_provider = _make_byteplus_provider_mock(status_response=status_response)
+    bp_cls_mock = _make_byteplus_class_mock(bp_provider)
+
+    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
+         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
+         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "key", "baseUrl": None}):
+        mock_session = AsyncMock()
+        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
+        mock_session.__aexit__ = AsyncMock(return_value=False)
+        _setup_db_session(mock_session, [task])
+        mock_session_cls.return_value = mock_session
+        await _run_recover_async()
+
+    assert task.status == TaskStatus.COMPLETED
+    assert task.result_url == "https://cdn.example.com/output.mp4"
+    assert task.completed_at is not None
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_recover_stuck_tasks_failed_on_byteplus_failed():
+    """Task is marked FAILED when BytePlus status is 'failed'."""
+    task = _make_stuck_task(BYTEPLUS_VIDEO_MODEL)
+    status_response = {
+        "status": "failed",
+        "error": {"message": "Quota exceeded"},
+    }
+    bp_provider = _make_byteplus_provider_mock(status_response=status_response)
+    bp_cls_mock = _make_byteplus_class_mock(bp_provider)
+
+    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
+         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
+         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "key", "baseUrl": None}):
+        mock_session = AsyncMock()
+        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
+        mock_session.__aexit__ = AsyncMock(return_value=False)
+        _setup_db_session(mock_session, [task])
+        mock_session_cls.return_value = mock_session
+        await _run_recover_async()
+
+    assert task.status == TaskStatus.FAILED
+    assert task.error_message is not None
+    assert "Quota exceeded" in task.error_message
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_recover_stuck_tasks_no_change_on_byteplus_processing():
+    """Task remains PROCESSING when BytePlus status is 'queued'."""
+    task = _make_stuck_task(BYTEPLUS_VIDEO_MODEL)
+    bp_provider = _make_byteplus_provider_mock(status_response={"status": "queued"})
+    bp_cls_mock = _make_byteplus_class_mock(bp_provider)
+
+    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
+         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
+         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "key", "baseUrl": None}):
+        mock_session = AsyncMock()
+        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
+        mock_session.__aexit__ = AsyncMock(return_value=False)
+        _setup_db_session(mock_session, [task])
+        mock_session_cls.return_value = mock_session
+        await _run_recover_async()
+
+    assert task.status == TaskStatus.PROCESSING
+    assert task.completed_at is None
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_recover_stuck_tasks_skip_when_byteplus_not_configured():
+    """When get_media_provider_key('byteplus_modelark') returns None, task is skipped."""
+    task = _make_stuck_task(BYTEPLUS_VIDEO_MODEL)
+    bp_provider = _make_byteplus_provider_mock()
+    bp_cls_mock = _make_byteplus_class_mock(bp_provider)
+
+    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
+         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
+         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value=None):
+        mock_session = AsyncMock()
+        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
+        mock_session.__aexit__ = AsyncMock(return_value=False)
+        _setup_db_session(mock_session, [task])
+        mock_session_cls.return_value = mock_session
+        await _run_recover_async()
+
+    # Provider was never called
+    bp_provider.get_task_status.assert_not_awaited()
+    # Task remains unchanged
+    assert task.status == TaskStatus.PROCESSING
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_recover_stuck_tasks_no_fail_on_byteplus_429():
+    """HTTP 429 from BytePlus does NOT mark the task as FAILED — task stays PROCESSING."""
+    import httpx
+    task = _make_stuck_task(BYTEPLUS_VIDEO_MODEL)
+    mock_response = MagicMock()
+    mock_response.status_code = 429
+    exc = httpx.HTTPStatusError("rate limited", request=MagicMock(), response=mock_response)
+    bp_provider = _make_byteplus_provider_mock(raise_exc=exc)
+    bp_cls_mock = _make_byteplus_class_mock(bp_provider)
+
+    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
+         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
+         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "key", "baseUrl": None}):
+        mock_session = AsyncMock()
+        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
+        mock_session.__aexit__ = AsyncMock(return_value=False)
+        _setup_db_session(mock_session, [task])
+        mock_session_cls.return_value = mock_session
+        await _run_recover_async()
+
+    assert task.status == TaskStatus.PROCESSING
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_recover_stuck_tasks_aclose_called_after_byteplus_check():
+    """BytePlusModelArkProvider.aclose() is called even when get_task_status raises."""
+    task = _make_stuck_task(BYTEPLUS_VIDEO_MODEL)
+    bp_provider = _make_byteplus_provider_mock(raise_exc=RuntimeError("network error"))
+    bp_cls_mock = _make_byteplus_class_mock(bp_provider)
+
+    with patch("app.tasks.media_tasks.AsyncSessionLocal") as mock_session_cls, \
+         patch(BYTEPLUS_PATCH, new=bp_cls_mock), \
+         patch(GET_PROVIDER_KEY_PATCH, new_callable=AsyncMock, return_value={"apiKey": "key", "baseUrl": None}):
+        mock_session = AsyncMock()
+        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
+        mock_session.__aexit__ = AsyncMock(return_value=False)
+        _setup_db_session(mock_session, [task])
+        mock_session_cls.return_value = mock_session
+        await _run_recover_async()
+
+    bp_provider.aclose.assert_awaited_once()
