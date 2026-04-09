"""Tests for the workflow WorkerRuntimeExecutor."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.worker_runtime_executor import WorkerRuntimeExecutor


def _make_context(user_token: str = "test-user-token") -> ExecutionContext:
    return ExecutionContext(
        user_id=7,
        tenant_id="tenant-1",
        workflow_id="workflow-1",
        execution_id="exec-1",
        extra_data={"user_token": user_token},
    )


def _make_data(node_type: str, config: dict | None = None) -> NodeExecutionData:
    return NodeExecutionData(
        node_id="node-1",
        node_type=node_type,
        config=config or {},
        inputs={},
        state={},
    )


def _mock_http_client(responses: list[MagicMock]):
    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = False
    mock_client.request = AsyncMock(side_effect=responses)
    return mock_client


@pytest.mark.asyncio
async def test_dispatch_worker_job_posts_to_node_runtime_bridge():
    response = MagicMock(status_code=201, text="")
    response.json.return_value = {
        "created": True,
        "workerJobId": "job-1",
        "status": "queued",
        "runtimeType": "desktop_zeroclaw_managed",
        "jobType": "video_assembly",
        "workerJob": {"id": "job-1"},
    }
    mock_client = _mock_http_client([response])

    with patch(
        "app.orchestrator.node_executors.worker_runtime_executor.httpx.AsyncClient",
        return_value=mock_client,
    ):
        result = await WorkerRuntimeExecutor().execute(
            _make_data(
                "dispatch_worker_job",
                {
                    "jobType": "video_assembly",
                    "jobRequest": {
                        "inputRefs": [],
                        "workspacePolicy": {"allowedSourceRoots": ["C:\\Media"]},
                        "editPlan": {"clips": []},
                        "subtitlePlan": {"mode": "none"},
                        "renderProfile": {"gpuRequired": False},
                        "outputTargets": [],
                    },
                },
            ),
            _make_context(),
        )

    assert result["workerJobId"] == "job-1"
    assert result["status"] == "queued"
    assert result["runtimeType"] == "desktop_zeroclaw_managed"
    assert result["error"] is None
    call = mock_client.request.await_args
    assert call.args[0] == "POST"
    assert call.args[1].endswith("/api/internal/workflow-worker-jobs/dispatch")
    assert call.kwargs["headers"]["Authorization"] == "Bearer test-user-token"
    assert call.kwargs["headers"]["Cookie"] == "app_session_id=test-user-token"


@pytest.mark.asyncio
async def test_dispatch_worker_job_supports_local_folder_ingest_payloads():
    response = MagicMock(status_code=201, text="")
    response.json.return_value = {
        "created": True,
        "workerJobId": "job-folder-1",
        "status": "queued",
        "runtimeType": "desktop_zeroclaw_managed",
        "jobType": "local_folder_ingest",
        "workerJob": {"id": "job-folder-1"},
    }
    mock_client = _mock_http_client([response])

    with patch(
        "app.orchestrator.node_executors.worker_runtime_executor.httpx.AsyncClient",
        return_value=mock_client,
    ):
        result = await WorkerRuntimeExecutor().execute(
            _make_data(
                "dispatch_worker_job",
                {
                    "jobType": "local_folder_ingest",
                    "jobRequest": {
                        "roots": [{
                            "rootId": "notes",
                            "name": "Notes",
                            "path": "C:\\Media\\Notes",
                        }],
                        "workspacePolicy": {"allowedSourceRoots": ["C:\\Media"]},
                        "ingestPolicy": {"maxDepth": 4, "maxFiles": 250},
                        "outputTargets": {
                            "publishManifestToLibrary": True,
                            "publishSummaryToLibrary": True,
                            "triggerIndexing": True,
                        },
                    },
                },
            ),
            _make_context(),
        )

    assert result["workerJobId"] == "job-folder-1"
    assert result["jobType"] == "local_folder_ingest"
    call = mock_client.request.await_args
    assert call.kwargs["json"]["jobType"] == "local_folder_ingest"
    assert call.kwargs["json"]["jobRequest"]["roots"][0]["rootId"] == "notes"


@pytest.mark.asyncio
async def test_dispatch_worker_job_supports_comfy_image_generation_payloads():
    response = MagicMock(status_code=201, text="")
    response.json.return_value = {
        "created": True,
        "workerJobId": "job-comfy-1",
        "status": "queued",
        "runtimeType": "desktop_zeroclaw_managed",
        "jobType": "comfy_image_generation",
        "workerJob": {"id": "job-comfy-1"},
    }
    mock_client = _mock_http_client([response])

    with patch(
        "app.orchestrator.node_executors.worker_runtime_executor.httpx.AsyncClient",
        return_value=mock_client,
    ):
        result = await WorkerRuntimeExecutor().execute(
            _make_data(
                "dispatch_worker_job",
                {
                    "jobType": "comfy_image_generation",
                    "jobRequest": {
                        "service": {
                            "baseUrl": "http://127.0.0.1:8188",
                            "submitPath": "/prompt",
                            "historyPathTemplate": "/history/{promptId}",
                            "viewPath": "/view",
                        },
                        "workflowJson": {"1": {"class_type": "KSampler"}},
                        "generationSpec": {
                            "promptSummary": "Editorial portrait",
                            "gpuRequired": True,
                        },
                        "outputTargets": {
                            "publishImagesToLibrary": True,
                            "publishManifestToLibrary": True,
                            "triggerIndexing": True,
                            "maxImages": 2,
                        },
                    },
                },
            ),
            _make_context(),
        )

    assert result["workerJobId"] == "job-comfy-1"
    assert result["jobType"] == "comfy_image_generation"
    call = mock_client.request.await_args
    assert call.kwargs["json"]["jobType"] == "comfy_image_generation"


@pytest.mark.asyncio
async def test_dispatch_worker_job_supports_comfy_workflow_run_payloads():
    response = MagicMock(status_code=201, text="")
    response.json.return_value = {
        "created": True,
        "workerJobId": "job-comfy-workflow-1",
        "status": "queued",
        "runtimeType": "desktop_zeroclaw_managed",
        "jobType": "comfy_workflow_run",
        "workerJob": {"id": "job-comfy-workflow-1"},
    }
    mock_client = _mock_http_client([response])

    with patch(
        "app.orchestrator.node_executors.worker_runtime_executor.httpx.AsyncClient",
        return_value=mock_client,
    ):
        result = await WorkerRuntimeExecutor().execute(
            _make_data(
                "dispatch_worker_job",
                {
                    "jobType": "comfy_workflow_run",
                    "jobRequest": {
                        "service": {
                            "baseUrl": "http://127.0.0.1:8188",
                            "submitPath": "/prompt",
                            "historyPathTemplate": "/history/{promptId}",
                            "viewPath": "/view",
                        },
                        "workflowJson": {"17": {"class_type": "TextOutput"}},
                        "workflowLabel": "Narrative Workflow",
                        "executionPolicy": {
                            "expectedOutputTypes": ["text"],
                            "gpuRequired": False,
                            "failOnMissingOutputs": True,
                        },
                        "outputTargets": {
                            "publishOutputFilesToLibrary": True,
                            "publishManifestToLibrary": True,
                            "triggerIndexing": True,
                            "maxOutputFiles": 4,
                        },
                    },
                },
            ),
            _make_context(),
        )

    assert result["workerJobId"] == "job-comfy-workflow-1"
    assert result["jobType"] == "comfy_workflow_run"
    call = mock_client.request.await_args
    assert call.kwargs["json"]["jobType"] == "comfy_workflow_run"


@pytest.mark.asyncio
async def test_dispatch_worker_job_supports_nemoclaw_runtime_selection():
    response = MagicMock(status_code=201, text="")
    response.json.return_value = {
        "created": True,
        "workerJobId": "job-nemo-1",
        "status": "queued",
        "runtimeType": "nemoclaw_sandbox",
        "jobType": "secure_browser_task",
        "workerJob": {"id": "job-nemo-1"},
    }
    mock_client = _mock_http_client([response])

    with patch(
        "app.orchestrator.node_executors.worker_runtime_executor.httpx.AsyncClient",
        return_value=mock_client,
    ):
        result = await WorkerRuntimeExecutor().execute(
            _make_data(
                "dispatch_worker_job",
                {
                    "runtimeType": "nemoclaw_sandbox",
                    "jobType": "secure_browser_task",
                    "resourceProfile": "sandbox_required",
                    "capabilityFamilies": ["secure-sandbox-exec"],
                    "inputJson": {"url": "https://example.com"},
                },
            ),
            _make_context(),
        )

    assert result["workerJobId"] == "job-nemo-1"
    assert result["runtimeType"] == "nemoclaw_sandbox"
    call = mock_client.request.await_args
    assert call.kwargs["json"]["runtimeType"] == "nemoclaw_sandbox"
    assert call.kwargs["json"]["resourceProfile"] == "sandbox_required"


@pytest.mark.asyncio
async def test_dispatch_worker_job_supports_hiclaw_runtime_selection():
    response = MagicMock(status_code=201, text="")
    response.json.return_value = {
        "created": True,
        "workerJobId": "job-hiclaw-1",
        "status": "queued",
        "runtimeType": "hiclaw_cluster",
        "jobType": "collaborative_agent_task",
        "workerJob": {"id": "job-hiclaw-1"},
    }
    mock_client = _mock_http_client([response])

    with patch(
        "app.orchestrator.node_executors.worker_runtime_executor.httpx.AsyncClient",
        return_value=mock_client,
    ):
        result = await WorkerRuntimeExecutor().execute(
            _make_data(
                "dispatch_worker_job",
                {
                    "runtimeType": "hiclaw_cluster",
                    "jobType": "collaborative_agent_task",
                    "resourceProfile": "human_observable",
                    "capabilityFamilies": ["multi-agent-cluster"],
                    "inputJson": {"topic": "market scan"},
                },
            ),
            _make_context(),
        )

    assert result["workerJobId"] == "job-hiclaw-1"
    assert result["runtimeType"] == "hiclaw_cluster"
    call = mock_client.request.await_args
    assert call.kwargs["json"]["runtimeType"] == "hiclaw_cluster"
    assert call.kwargs["json"]["resourceProfile"] == "human_observable"


@pytest.mark.asyncio
async def test_wait_for_worker_completion_polls_until_terminal():
    running = MagicMock(status_code=200, text="")
    running.json.return_value = {
        "workerJobId": "job-1",
        "status": "running",
        "terminal": False,
        "artifactRefs": [],
        "publishedArtifacts": [],
    }
    completed = MagicMock(status_code=200, text="")
    completed.json.return_value = {
        "workerJobId": "job-1",
        "status": "completed",
        "terminal": True,
        "failureReason": None,
        "workerJob": {"id": "job-1"},
        "artifactRefs": [{"artifactId": "artifact-1"}],
        "publishedArtifacts": [{"publishedItemId": 101}],
    }
    mock_client = _mock_http_client([running, completed])

    with (
        patch(
            "app.orchestrator.node_executors.worker_runtime_executor.httpx.AsyncClient",
            return_value=mock_client,
        ),
        patch(
            "app.orchestrator.node_executors.worker_runtime_executor.asyncio.sleep",
            new_callable=AsyncMock,
        ),
    ):
        result = await WorkerRuntimeExecutor().execute(
            _make_data(
                "wait_for_worker_completion",
                {"workerJobId": "job-1", "timeoutSeconds": 30, "pollIntervalMs": 10},
            ),
            _make_context(),
        )

    assert result["workerJobId"] == "job-1"
    assert result["terminalStatus"] == "completed"
    assert result["completed"] is True
    assert result["failed"] is False
    assert result["artifactRefs"] == [{"artifactId": "artifact-1"}]


@pytest.mark.asyncio
async def test_wait_for_worker_completion_reports_timeout():
    running = MagicMock(status_code=200, text="")
    running.json.return_value = {
        "workerJobId": "job-1",
        "status": "running",
        "terminal": False,
        "workerJob": {"id": "job-1"},
        "artifactRefs": [],
        "publishedArtifacts": [],
    }
    mock_client = _mock_http_client([running])

    with (
        patch(
            "app.orchestrator.node_executors.worker_runtime_executor.httpx.AsyncClient",
            return_value=mock_client,
        ),
        patch(
            "app.orchestrator.node_executors.worker_runtime_executor.monotonic",
            side_effect=[0, 10],
        ),
    ):
        result = await WorkerRuntimeExecutor().execute(
            _make_data(
                "wait_for_worker_completion",
                {"workerJobId": "job-1", "timeoutSeconds": 5, "pollIntervalMs": 1000},
            ),
            _make_context(),
        )

    assert result["workerJobId"] == "job-1"
    assert result["timedOut"] is True
    assert "Timed out waiting for worker job job-1" in result["error"]


@pytest.mark.asyncio
async def test_publish_worker_artifacts_returns_publication_summary():
    response = MagicMock(status_code=200, text="")
    response.json.return_value = {
        "workerJobId": "job-1",
        "publishedArtifacts": [{"artifactId": "artifact-1", "publishedItemId": 101}],
        "publishedItemIds": [101],
        "publishedCount": 1,
    }
    mock_client = _mock_http_client([response])

    with patch(
        "app.orchestrator.node_executors.worker_runtime_executor.httpx.AsyncClient",
        return_value=mock_client,
    ):
        result = await WorkerRuntimeExecutor().execute(
            _make_data("publish_worker_artifacts", {"workerJobId": "job-1"}),
            _make_context(),
        )

    assert result["workerJobId"] == "job-1"
    assert result["publishedItemIds"] == [101]
    assert result["publishedCount"] == 1
    assert result["error"] is None


@pytest.mark.asyncio
async def test_worker_runtime_executor_requires_auth_token():
    result = await WorkerRuntimeExecutor().execute(
        _make_data("dispatch_worker_job", {"jobType": "video_assembly"}),
        _make_context(user_token=""),
    )

    assert result["status"] == "error"
    assert "authentication token" in result["error"].lower()
