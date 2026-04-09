"""Workflow executor for worker-runtime dispatch / wait / publish / index nodes."""

from __future__ import annotations

import asyncio
import os
from time import monotonic
from typing import Any

import httpx
import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger(__name__)

NODEJS_INTERNAL_URL = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000").rstrip("/")
TERMINAL_STATUSES = {"completed", "failed", "canceled", "expired"}


def _read_value(data: NodeExecutionData, key: str, default: Any = None) -> Any:
    if key in data.inputs:
        return data.inputs.get(key)
    return data.config.get(key, default)


def _coerce_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, parsed))


def _build_headers(user_token: str, context: ExecutionContext) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {user_token}",
        "Cookie": f"app_session_id={user_token}",
        "X-Request-ID": context.execution_id,
    }


def _extract_error_message(response: Any, body: dict[str, Any] | None) -> str:
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str) and error["message"].strip():
            return error["message"].strip()
        if isinstance(error, str) and error.strip():
            return error.strip()
        if isinstance(body.get("detail"), str) and body["detail"].strip():
            return body["detail"].strip()
        if isinstance(body.get("message"), str) and body["message"].strip():
            return body["message"].strip()
    text = getattr(response, "text", "")
    if isinstance(text, str) and text.strip():
        return text.strip()[:500]
    return f"HTTP {getattr(response, 'status_code', 500)}"


def _build_dispatch_error(node_type: str, message: str) -> dict[str, Any]:
    return {
        "workerJobId": None,
        "status": "error",
        "runtimeType": None,
        "jobType": None,
        "created": False,
        "workerJob": None,
        "queueMetadata": None,
        "terminalStatus": None,
        "completed": False,
        "failed": True,
        "timedOut": False,
        "failureSummary": message,
        "artifactRefs": [],
        "publishedArtifacts": [],
        "publishedItemIds": [],
        "publishedCount": 0,
        "indexingJobs": [],
        "indexedCount": 0,
        "nodeType": node_type,
        "error": message,
    }


def _build_wait_result(status_payload: dict[str, Any]) -> dict[str, Any]:
    status = str(status_payload.get("status") or "")
    failure_reason = status_payload.get("failureReason")
    artifact_refs = status_payload.get("artifactRefs")
    published_artifacts = status_payload.get("publishedArtifacts")

    return {
        "workerJobId": status_payload.get("workerJobId"),
        "terminalStatus": status,
        "completed": status == "completed",
        "failed": status in {"failed", "canceled", "expired"},
        "timedOut": False,
        "failureSummary": failure_reason if isinstance(failure_reason, str) else None,
        "workerJob": status_payload.get("workerJob"),
        "artifactRefs": artifact_refs if isinstance(artifact_refs, list) else [],
        "publishedArtifacts": published_artifacts if isinstance(published_artifacts, list) else [],
        "error": None,
    }


class WorkerRuntimeExecutor:
    """Executor that bridges workflow nodes to Node.js worker-runtime routes."""

    async def _request(
        self,
        *,
        method: str,
        path: str,
        context: ExecutionContext,
        json_body: dict[str, Any] | None = None,
        timeout_seconds: float = 30.0,
    ) -> tuple[dict[str, Any] | None, str | None]:
        user_token = context.extra_data.get("user_token", "")
        if not isinstance(user_token, str) or not user_token.strip():
            return None, "No authentication token available for workflow worker-runtime route"

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                response = await client.request(
                    method,
                    f"{NODEJS_INTERNAL_URL}{path}",
                    json=json_body,
                    headers=_build_headers(user_token.strip(), context),
                )
        except httpx.TimeoutException:
            return None, f"Workflow worker-runtime request timed out after {timeout_seconds:.1f}s"
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception(
                "worker_runtime_executor_request_failed",
                method=method,
                path=path,
                execution_id=context.execution_id,
            )
            return None, f"Workflow worker-runtime request failed: {exc}"

        try:
            payload = response.json()
        except Exception:
            payload = None

        if response.status_code >= 400:
            return None, _extract_error_message(response, payload if isinstance(payload, dict) else None)

        if not isinstance(payload, dict):
            return None, "Workflow worker-runtime route returned an invalid response"

        return payload, None

    async def _dispatch(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        job_type = _read_value(data, "jobType")
        if not isinstance(job_type, str) or not job_type.strip():
            return _build_dispatch_error(data.node_type, "dispatch_worker_job requires jobType")

        runtime_type = _read_value(data, "runtimeType")
        job_request = _read_value(data, "jobRequest")
        input_json = _read_value(data, "inputJson")
        instructions_json = _read_value(data, "instructionsJson")
        capability_families = _read_value(data, "capabilityFamilies")
        idempotency_key = _read_value(data, "idempotencyKey")
        if not isinstance(idempotency_key, str) or not idempotency_key.strip():
            idempotency_key = f"{context.execution_id}:{data.node_id}:{job_type.strip()}"

        payload = {
            "runtimeType": runtime_type if isinstance(runtime_type, str) else None,
            "jobType": job_type.strip(),
            "title": _read_value(data, "title"),
            "description": _read_value(data, "description"),
            "priority": _read_value(data, "priority"),
            "timeoutSeconds": _read_value(data, "timeoutSeconds"),
            "resourceProfile": _read_value(data, "resourceProfile"),
            "capabilityFamilies": capability_families if isinstance(capability_families, list) else None,
            "preferredWorkerId": _read_value(data, "preferredWorkerId"),
            "idempotencyKey": idempotency_key,
            "workflowRunId": _read_value(data, "workflowRunId"),
            "requestedByPersonaId": _read_value(data, "requestedByPersonaId"),
            "requestedBySystemComponent": _read_value(data, "requestedBySystemComponent") or "workflow_runtime_node",
            "teamId": _read_value(data, "teamId"),
            "jobRequest": job_request if isinstance(job_request, dict) else None,
            "inputJson": input_json if isinstance(input_json, dict) else None,
            "instructionsJson": instructions_json if isinstance(instructions_json, dict) else None,
            "reservedCredits": _read_value(data, "reservedCredits"),
        }

        response_body, error = await self._request(
            method="POST",
            path="/api/internal/workflow-worker-jobs/dispatch",
            context=context,
            json_body=payload,
            timeout_seconds=30.0,
        )
        if error or not response_body:
            return _build_dispatch_error(data.node_type, error or "Failed to dispatch worker job")

        return {
            "workerJobId": response_body.get("workerJobId"),
            "status": response_body.get("status"),
            "runtimeType": response_body.get("runtimeType"),
            "jobType": response_body.get("jobType"),
            "created": bool(response_body.get("created", False)),
            "workerJob": response_body.get("workerJob"),
            "queueMetadata": {
                "nodeId": data.node_id,
                "executionId": context.execution_id,
                "idempotencyKey": idempotency_key,
            },
            "error": None,
        }

    async def _wait_for_completion(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        worker_job_id = _read_value(data, "workerJobId")
        if not isinstance(worker_job_id, str) or not worker_job_id.strip():
            return _build_dispatch_error(data.node_type, "wait_for_worker_completion requires workerJobId")

        timeout_seconds = _coerce_int(_read_value(data, "timeoutSeconds"), 900, 5, 86_400)
        poll_interval_ms = _coerce_int(_read_value(data, "pollIntervalMs"), 5000, 250, 30_000)
        deadline = monotonic() + timeout_seconds

        while True:
            response_body, error = await self._request(
                method="GET",
                path=f"/api/internal/workflow-worker-jobs/{worker_job_id.strip()}",
                context=context,
                timeout_seconds=15.0,
            )
            if error or not response_body:
                return _build_dispatch_error(data.node_type, error or "Failed to read worker job status")

            status = str(response_body.get("status") or "")
            terminal = bool(response_body.get("terminal")) or status in TERMINAL_STATUSES
            if terminal:
                return _build_wait_result(response_body)

            remaining = deadline - monotonic()
            if remaining <= 0:
                return {
                    "workerJobId": worker_job_id.strip(),
                    "terminalStatus": status or "timeout",
                    "completed": False,
                    "failed": False,
                    "timedOut": True,
                    "failureSummary": None,
                    "workerJob": response_body.get("workerJob"),
                    "artifactRefs": response_body.get("artifactRefs") if isinstance(response_body.get("artifactRefs"), list) else [],
                    "publishedArtifacts": response_body.get("publishedArtifacts") if isinstance(response_body.get("publishedArtifacts"), list) else [],
                    "error": f"Timed out waiting for worker job {worker_job_id.strip()} after {timeout_seconds}s",
                }

            await asyncio.sleep(min(poll_interval_ms / 1000.0, max(0.1, remaining)))

    async def _publish(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        worker_job_id = _read_value(data, "workerJobId")
        if not isinstance(worker_job_id, str) or not worker_job_id.strip():
            return _build_dispatch_error(data.node_type, "publish_worker_artifacts requires workerJobId")

        response_body, error = await self._request(
            method="POST",
            path=f"/api/internal/workflow-worker-jobs/{worker_job_id.strip()}/publish",
            context=context,
            json_body={"publishArtifacts": True},
            timeout_seconds=30.0,
        )
        if error or not response_body:
            return _build_dispatch_error(data.node_type, error or "Failed to publish worker artifacts")

        published_artifacts = response_body.get("publishedArtifacts")
        published_item_ids = response_body.get("publishedItemIds")
        return {
            "workerJobId": response_body.get("workerJobId"),
            "publishedArtifacts": published_artifacts if isinstance(published_artifacts, list) else [],
            "publishedItemIds": published_item_ids if isinstance(published_item_ids, list) else [],
            "publishedCount": int(response_body.get("publishedCount") or 0),
            "error": None,
        }

    async def _trigger_index(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        worker_job_id = _read_value(data, "workerJobId")
        if not isinstance(worker_job_id, str) or not worker_job_id.strip():
            return _build_dispatch_error(data.node_type, "trigger_worker_rag_index requires workerJobId")

        response_body, error = await self._request(
            method="POST",
            path=f"/api/internal/workflow-worker-jobs/{worker_job_id.strip()}/trigger-index",
            context=context,
            json_body={"publishArtifacts": False},
            timeout_seconds=30.0,
        )
        if error or not response_body:
            return _build_dispatch_error(data.node_type, error or "Failed to trigger worker RAG indexing")

        indexing_jobs = response_body.get("indexingJobs")
        published_item_ids = response_body.get("publishedItemIds")
        return {
            "workerJobId": response_body.get("workerJobId"),
            "indexingJobs": indexing_jobs if isinstance(indexing_jobs, list) else [],
            "publishedItemIds": published_item_ids if isinstance(published_item_ids, list) else [],
            "indexedCount": int(response_body.get("indexedCount") or 0),
            "error": None,
        }

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        node_type = data.node_type

        if node_type == "dispatch_worker_job":
            return await self._dispatch(data, context)
        if node_type == "wait_for_worker_completion":
            return await self._wait_for_completion(data, context)
        if node_type == "publish_worker_artifacts":
            return await self._publish(data, context)
        if node_type == "trigger_worker_rag_index":
            return await self._trigger_index(data, context)

        logger.warning("worker_runtime_executor_unknown_node_type", node_type=node_type)
        return _build_dispatch_error(node_type, f"Unsupported worker runtime node type: {node_type}")
