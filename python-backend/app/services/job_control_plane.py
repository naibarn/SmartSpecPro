"""Runtime-neutral Python port for Celery/Worker executors.

The client only sends canonical job identity plus fenced lease context. It does
not expose broker retry or result-backend state as business state.
"""

import os
import re
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from typing import Any

import httpx


class JobControlPlaneError(RuntimeError):
    """Stable Python-side error for control-plane transport/domain failures."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class LeaseContext:
    job_id: str
    attempt_id: str
    lease_token: str
    fencing_version: int
    expires_at: str


@dataclass(frozen=True)
class JobRef:
    """Canonical job reference returned by the control-plane create port."""

    job_id: str
    created: bool


@dataclass(frozen=True)
class TaskDispatchRef:
    """Compatibility-shaped handle; ``id`` is always the canonical job ID."""

    id: str
    created: bool


@dataclass(frozen=True)
class ReadyJob:
    """A pull-delivery candidate pinned to the currently published attempt."""

    job_id: str
    attempt: int
    # Initial delivery is intentionally unpinned; the control plane creates
    # the attempt during claim(). Retries carry the existing attempt ID.
    attempt_id: str | None


_DURABLE_SECRET_KEY = re.compile(
    r"(?:^|[_-])(authorization|access[_-]?token|user[_-]?token|api[_-]?key|password|secret|credential|private[_-]?key|signed[_-]?url|cookie)(?:$|[_-])",
    re.IGNORECASE,
)
_SAFE_TASK_IMPORT_PATH = re.compile(r"^app(?:\.[A-Za-z_][A-Za-z0-9_]*)+$")


def _remove_durable_secrets(value: Any) -> Any:
    """Remove credential-shaped fields before hard jobs enter PostgreSQL."""
    if isinstance(value, dict):
        return {
            key: _remove_durable_secrets(child)
            for key, child in value.items()
            if not _DURABLE_SECRET_KEY.search(str(key))
        }
    if isinstance(value, list):
        return [_remove_durable_secrets(child) for child in value]
    if isinstance(value, tuple):
        return [_remove_durable_secrets(child) for child in value]
    return value


def _resolve_task_import_path(task_name: str, legacy_task: Any | None) -> str | None:
    """Resolve a Celery alias to a server-owned import path for pull workers."""
    candidate = legacy_task
    if candidate is not None:
        candidate = getattr(candidate, "run", candidate)
        module_name = getattr(candidate, "__module__", "")
        function_name = getattr(candidate, "__name__", "")
        derived = f"{module_name}.{function_name}" if module_name and function_name else ""
        if _SAFE_TASK_IMPORT_PATH.fullmatch(derived):
            return derived
    if _SAFE_TASK_IMPORT_PATH.fullmatch(task_name):
        return task_name
    return None


class JobControlPlaneClient:
    def __init__(self, base_url: str | None = None, client: httpx.Client | None = None):
        self.base_url = (base_url or os.getenv("JOB_CONTROL_PLANE_URL", "http://localhost:3000/api/internal/job-control-plane")).rstrip("/")
        self.client = client or httpx.Client(timeout=15.0)

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {}
        internal_token = (
            os.getenv("SMARTSPEC_INTERNAL_TOKEN")
            or os.getenv("INTERNAL_TOKEN")
            or os.getenv("SMARTSPEC_PROXY_TOKEN")
            or os.getenv("SMARTSPEC_WEB_GATEWAY_TOKEN")
        )
        if not internal_token:
            # Pydantic settings also loads the backend .env file; relying only
            # on os.environ makes a valid local/deployed configuration look
            # unauthenticated to the Node control-plane route.
            from app.core.config import settings

            internal_token = getattr(settings, "SMARTSPEC_PROXY_TOKEN", "") or getattr(
                settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", ""
            )
        if internal_token:
            headers["x-internal-token"] = internal_token
        try:
            response = self.client.post(f"{self.base_url}/{path.lstrip('/')}", json=payload, headers=headers)
            response.raise_for_status()
        except httpx.HTTPStatusError as error:
            code = "JOB_CONTROL_PLANE_ERROR"
            try:
                body = error.response.json()
                if isinstance(body, dict) and isinstance(body.get("error"), str):
                    code = body["error"]
            except (ValueError, TypeError):
                pass
            raise JobControlPlaneError(code, f"Control-plane request failed: {code}") from error
        except httpx.HTTPError as error:
            raise JobControlPlaneError("JOB_CONTROL_PLANE_UNAVAILABLE", "Control-plane request was unavailable") from error
        body = response.json()
        if not isinstance(body, dict):
            raise JobControlPlaneError("JOB_CONTROL_PLANE_INVALID_RESPONSE", "Control-plane response was invalid")
        return body

    def claim(self, job_id: str, runner_id: str, adapter: str, attempt_id: str | None = None) -> LeaseContext | None:
        payload: dict[str, Any] = {"jobId": job_id, "runnerId": runner_id, "adapter": adapter}
        if attempt_id:
            payload["attemptId"] = attempt_id
        body = self._post("claim", payload)
        if not body.get("lease"):
            return None
        raw = body["lease"]
        return LeaseContext(
            job_id=raw["jobId"],
            attempt_id=raw["attemptId"],
            lease_token=raw["leaseToken"],
            fencing_version=raw["fencingVersion"],
            expires_at=raw["expiresAt"],
        )

    def create(self, definition: dict[str, Any], *, tenant_id: str, actor_type: str = "system",
               actor_id: int | None = None, authorization_scope: str = "python.job-dispatch",
               correlation_id: str = "python-job-dispatch", idempotency_key: str | None = None,
               runtime_type: str = "python_job_worker") -> JobRef:
        """Create a canonical job before any Python transport publication."""
        context: dict[str, Any] = {
            "tenantId": tenant_id,
            "actorType": actor_type,
            "authorizationScope": authorization_scope,
            "correlationId": correlation_id,
        }
        if actor_id is not None:
            context["actorId"] = actor_id
        if idempotency_key:
            context["idempotencyKey"] = idempotency_key
        body = self._post("create", {
            "context": context,
            "definition": definition,
            "runtimeType": runtime_type,
        })
        job_id = body.get("jobId")
        if not isinstance(job_id, str) or not job_id:
            raise JobControlPlaneError("JOB_CONTROL_PLANE_INVALID_RESPONSE", "Create response did not contain a canonical job ID")
        return JobRef(job_id=job_id, created=bool(body.get("created")))

    def ready(self, limit: int = 1) -> list[ReadyJob]:
        """Return queued Python jobs with a durable published pull dispatch."""
        body = self._post("ready", {"runtimeType": "python_job_worker", "limit": max(1, min(int(limit), 100))})
        jobs = body.get("jobs")
        if not isinstance(jobs, list):
            raise JobControlPlaneError("JOB_CONTROL_PLANE_INVALID_RESPONSE", "Ready response did not contain jobs")
        ready_jobs: list[ReadyJob] = []
        for item in jobs:
            if not isinstance(item, dict):
                continue
            job_id = item.get("jobId")
            attempt = item.get("attempt")
            attempt_id = item.get("attemptId")
            if (
                isinstance(job_id, str)
                and job_id
                and isinstance(attempt, int)
                and attempt >= 1
                and (attempt_id is None or (isinstance(attempt_id, str) and bool(attempt_id)))
            ):
                ready_jobs.append(ReadyJob(job_id=job_id, attempt=attempt, attempt_id=attempt_id))
        return ready_jobs

    def context(self, job_id: str, *, tenant_id: str | None = None, requested_by_user_id: int | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"jobId": job_id}
        if tenant_id:
            payload["tenantId"] = tenant_id
        if requested_by_user_id is not None:
            payload["requestedByUserId"] = requested_by_user_id
        body = self._post("context", payload)
        context = body.get("context")
        if not isinstance(context, dict) or not isinstance(context.get("jobType"), str):
            raise JobControlPlaneError("JOB_CONTROL_PLANE_INVALID_CONTEXT", "Control-plane context was invalid")
        return context

    def status(self, job_id: str, *, include_dispatches: bool = True, tenant_id: str | None = None, requested_by_user_id: int | None = None) -> dict[str, Any]:
        """Read canonical status; broker/result-backend state is never consulted."""
        payload: dict[str, Any] = {"jobId": job_id, "includeDispatches": include_dispatches}
        if tenant_id:
            payload["tenantId"] = tenant_id
        if requested_by_user_id is not None:
            payload["requestedByUserId"] = requested_by_user_id
        body = self._post("status", payload)
        snapshot = body.get("status")
        if not isinstance(snapshot, dict) or not isinstance(snapshot.get("status"), str):
            raise JobControlPlaneError("JOB_CONTROL_PLANE_INVALID_STATUS", "Control-plane status was invalid")
        return snapshot | {
            "transportObservations": body.get("transportObservations", []),
        }

    def legacy_status(
        self,
        task_id: str,
        *,
        task_name: str | None = None,
        tenant_id: str | None = None,
        user_id: int | None = None,
    ) -> dict[str, Any] | None:
        """Project a legacy task status from the canonical job ledger.

        The task identifier is only a lookup hint. Tenant/user filters are
        applied by the Node control-plane route before a row is returned.
        Redis/Celery result state is never consulted on this path.
        """
        payload: dict[str, Any] = {"taskId": task_id}
        if task_name:
            payload["taskName"] = task_name
        if tenant_id:
            payload["tenantId"] = tenant_id
        if user_id is not None:
            payload["requestedByUserId"] = user_id
        body = self._post("legacy-status", payload)
        snapshot = body.get("status")
        if not isinstance(snapshot, dict):
            return None
        progress = snapshot.get("progress") if isinstance(snapshot.get("progress"), dict) else {}
        legacy = progress.get("legacyStatus") if isinstance(progress.get("legacyStatus"), dict) else None
        output = snapshot.get("output") if isinstance(snapshot.get("output"), dict) else None
        canonical = str(snapshot.get("status") or "unknown")
        if canonical == "succeeded" and output is not None:
            if isinstance(output.get("status"), str):
                result = dict(output)
            else:
                result = {"status": "completed", "result": output}
        elif legacy is not None:
            result = dict(legacy)
        else:
            result = {
                "status": {
                    "queued": "queued",
                    "leased": "processing",
                    "running": "processing",
                    "waiting_external": "processing",
                    "retry_scheduled": "queued",
                    "succeeded": "completed",
                    "failed": "failed",
                    "cancelled": "cancelled",
                    "expired": "failed",
                }.get(canonical, canonical),
            }
        result.setdefault("canonical_job_id", snapshot.get("jobId"))
        result.setdefault("canonical_status", canonical)
        return result

    def report_legacy_status(self, lease: LeaseContext, status: dict[str, Any]) -> None:
        """Persist a bounded legacy status projection under the lease fence."""
        self._post("legacy-progress", {
            "jobId": lease.job_id,
            "attemptId": lease.attempt_id,
            "leaseToken": lease.lease_token,
            "fencingVersion": lease.fencing_version,
            "legacyStatus": status,
        })

    def latest(
        self,
        task_name: str,
        *,
        tenant_id: str | None = None,
        requested_by_user_id: int | None = None,
    ) -> str | None:
        """Find the latest canonical legacy-task job within an optional scope."""
        payload: dict[str, Any] = {"taskName": task_name}
        if tenant_id:
            payload["tenantId"] = tenant_id
        if requested_by_user_id is not None:
            payload["requestedByUserId"] = requested_by_user_id
        body = self._post("latest", payload)
        job_id = body.get("jobId")
        return job_id if isinstance(job_id, str) and job_id else None

    def cancel(
        self,
        job_id: str,
        *,
        action_id: str,
        reason: str = "cancelled_by_request",
        actor_id: int | None = None,
        tenant_id: str | None = None,
        requested_by_user_id: int | None = None,
    ) -> None:
        payload: dict[str, Any] = {"jobId": job_id, "actionId": action_id, "reason": reason}
        if actor_id is not None:
            payload["actorId"] = actor_id
        if tenant_id:
            payload["tenantId"] = tenant_id
        if requested_by_user_id is not None:
            payload["requestedByUserId"] = requested_by_user_id
        self._post("cancel", payload)

    def start(self, lease: LeaseContext) -> None:
        self._post("start", {"jobId": lease.job_id, "attemptId": lease.attempt_id, "leaseToken": lease.lease_token, "fencingVersion": lease.fencing_version})

    def heartbeat(self, lease: LeaseContext) -> None:
        self._post("heartbeat", self._lease_payload(lease))

    def progress(self, lease: LeaseContext, progress: dict[str, Any]) -> None:
        self._post("progress", {**self._lease_payload(lease), "progress": progress})

    def wait_for_external(self, lease: LeaseContext, external_wait: dict[str, Any]) -> None:
        self._post("wait-for-external", {**self._lease_payload(lease), "externalWait": external_wait})

    def complete_external(self, job_id: str, result_ref: str, operation_key: str) -> bool:
        body = self._post("complete-external", {
            "jobId": job_id,
            "resultRef": result_ref,
            "operationKey": operation_key,
        })
        return bool(body.get("completed"))

    def register_external_provider(
        self,
        *,
        job_id: str,
        operation_key: str,
        provider: str,
        provider_job_id: str,
        next_poll_at: str,
        provider_deadline_at: str,
    ) -> bool:
        body = self._post("register-external-provider", {
            "jobId": job_id,
            "operationKey": operation_key,
            "provider": provider,
            "providerJobId": provider_job_id,
            "nextPollAt": next_poll_at,
            "providerDeadlineAt": provider_deadline_at,
        })
        return bool(body.get("registered"))

    def fail_external_wait(
        self,
        job_id: str,
        reason: str,
        *,
        operator_review_required: bool = True,
        operation_key: str | None = None,
    ) -> bool:
        payload: dict[str, Any] = {
            "jobId": job_id,
            "reason": reason[:500],
            "operatorReviewRequired": operator_review_required,
        }
        if operation_key:
            payload["operationKey"] = operation_key
        body = self._post("fail-external-wait", payload)
        return bool(body.get("failed"))

    def resume_external(
        self,
        job_id: str,
        runner_id: str,
        adapter: str,
        *,
        input_json: dict[str, Any] | None = None,
        resume_key: str | None = None,
    ) -> bool:
        payload: dict[str, Any] = {"jobId": job_id, "runnerId": runner_id, "adapter": adapter}
        if input_json is not None:
            payload["inputJson"] = input_json
        if resume_key:
            payload["resumeKey"] = resume_key
        body = self._post("resume-external", payload)
        return bool(body.get("resumed"))

    def record_callback(self, callback: dict[str, Any]) -> dict[str, Any]:
        """Submit adapter-authenticated callback evidence; never completes a job."""
        if not isinstance(callback.get("occurredAt"), str) or not callback["occurredAt"].strip():
            raise JobControlPlaneError("CALLBACK_TIMESTAMP_REQUIRED", "Authenticated callbacks require occurredAt")
        return self._post("callback", callback)

    def complete(self, lease: LeaseContext, result: dict[str, Any]) -> None:
        self._post("complete", {**self._lease_payload(lease), "result": result})

    def fail(self, lease: LeaseContext, error: dict[str, Any]) -> None:
        self._post("fail", {**self._lease_payload(lease), "error": error})

    def assert_active(self, lease: LeaseContext) -> None:
        """Verify the lease fence without advancing business retry state."""
        self._post("assert-active", self._lease_payload(lease))

    @staticmethod
    def _lease_payload(lease: LeaseContext) -> dict[str, Any]:
        return {"jobId": lease.job_id, "attemptId": lease.attempt_id, "leaseToken": lease.lease_token, "fencingVersion": lease.fencing_version}


def dispatch_python_task(
    task_name: str,
    *,
    args: list[Any] | tuple[Any, ...] = (),
    kwargs: dict[str, Any] | None = None,
    tenant_id: str | None = None,
    user_id: int | str | None = None,
    idempotency_key: str | None = None,
    queue: str | None = None,
    countdown: int | None = None,
    correlation_id: str | None = None,
    legacy_task: Any | None = None,
    legacy_task_id: str | None = None,
) -> TaskDispatchRef:
    """Persist every Python task to the canonical worker_jobs control plane."""

    effective_tenant_id = str(tenant_id or os.getenv("FEATURE_186_SYSTEM_TENANT_ID", "")).strip()
    if not effective_tenant_id:
        raise JobControlPlaneError("JOB_TENANT_REQUIRED", f"Tenant scope is required for {task_name}")
    if not isinstance(idempotency_key, str) or not idempotency_key.strip():
        raise JobControlPlaneError(
            "JOB_IDEMPOTENCY_REQUIRED",
            f"An idempotency key is required for hard-cutover task {task_name}",
        )
    if not isinstance(task_name, str) or not task_name.strip() or len(task_name) > 200:
        raise JobControlPlaneError("JOB_TASK_INVALID", "Task identity is invalid")
    task_import_path = _resolve_task_import_path(task_name, legacy_task)
    if not task_import_path:
        raise JobControlPlaneError(
            "JOB_TASK_IMPORT_PATH_REQUIRED",
            f"Hard-cutover task {task_name} has no safe import path",
        )
    safe_args = _remove_durable_secrets(list(args))
    safe_kwargs = _remove_durable_secrets(kwargs or {})
    definition = {
        "contractVersion": "feature-186-v1",
        "jobType": "python.legacy_task",
        "executionClass": "cpu" if queue in {"video", "audio", "sandbox"} else "long",
        "input": {
            "taskName": task_name,
            "taskImportPath": task_import_path,
            "args": safe_args,
            "kwargs": safe_kwargs,
            "queue": queue,
            "legacyUserId": str(user_id) if user_id is not None else None,
        },
        "retryPolicy": {
            "maxAttempts": 3,
            "baseDelayMs": 1000,
            "maxDelayMs": 900000,
            "jitter": "bounded",
            "deadlineMs": 24 * 60 * 60 * 1000,
            "allowedErrorClasses": ["retryable", "timeout", "unavailable"],
        },
        "timeoutPolicy": {
            "softTimeoutMs": 25 * 60 * 1000 if queue in {"video", "audio", "sandbox"} else 5 * 60 * 1000,
            "hardTimeoutMs": 30 * 60 * 1000 if queue in {"video", "audio", "sandbox"} else 10 * 60 * 1000,
        },
        "requiredCapabilities": {"queue": queue} if queue else {},
    }
    if countdown is not None:
        definition["scheduledAt"] = (
            datetime.now(timezone.utc) + timedelta(seconds=max(0, int(countdown)))
        ).isoformat()
    ref = JobControlPlaneClient().create(
        definition,
        tenant_id=effective_tenant_id,
        actor_type="user" if user_id is not None else "system",
        actor_id=int(user_id) if user_id is not None and str(user_id).isdigit() else None,
        correlation_id=correlation_id or f"python:{task_name}",
        idempotency_key=idempotency_key,
    )
    return TaskDispatchRef(id=ref.job_id, created=ref.created)
