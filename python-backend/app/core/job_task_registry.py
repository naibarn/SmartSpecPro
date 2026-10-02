"""Callable metadata registry for Python executors dispatched by worker_jobs.

This module deliberately has no broker, scheduler, or result-backend behavior.
"""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

DEFAULT_RETRY_DEADLINE_SECONDS = 10 * 60
MAX_RETRY_DEADLINE_SECONDS = 2 * 60 * 60


class JobTaskRegistry:
    def __init__(self) -> None:
        self.tasks: dict[str, Callable[..., Any]] = {}

    def task(self, *decorator_args: Any, **options: Any):
        def register(function: Callable[..., Any]) -> Callable[..., Any]:
            name = str(options.get("name") or f"{function.__module__}.{function.__name__}")
            function.name = name  # type: ignore[attr-defined]
            function.run = function  # type: ignore[attr-defined]
            function.max_retries = int(options.get("max_retries", 0) or 0)  # type: ignore[attr-defined]
            function._job_task_bind = bool(options.get("bind", False))  # type: ignore[attr-defined]
            if "max_retries" in options or "default_retry_delay" in options or "retry_delays_seconds" in options:
                function.default_retry_delay = int(options.get("default_retry_delay", 1) or 1)  # type: ignore[attr-defined]
                retry_deadline_seconds = options.get(
                    "retry_deadline_seconds", DEFAULT_RETRY_DEADLINE_SECONDS
                )
                if (
                    type(retry_deadline_seconds) is not int
                    or retry_deadline_seconds < 1
                    or retry_deadline_seconds > MAX_RETRY_DEADLINE_SECONDS
                ):
                    raise ValueError("JOB_TASK_RETRY_DEADLINE_OUT_OF_RANGE")
                retry_delays = options.get("retry_delays_seconds")
                function._job_task_retry_policy = {  # type: ignore[attr-defined]
                    "maxAttempts": function.max_retries + 1,  # type: ignore[attr-defined]
                    "baseDelayMs": function.default_retry_delay * 1000,  # type: ignore[attr-defined]
                    "maxDelayMs": int(options.get("max_retry_delay", 900) or 900) * 1000,
                    "jitter": "none",
                    "deadlineMs": retry_deadline_seconds * 1000,
                    "allowedErrorClasses": ["retryable", "timeout", "unavailable"],
                    **({"retryDelaysMs": [int(value) * 1000 for value in retry_delays]} if isinstance(retry_delays, (list, tuple)) else {}),
                }
                function._job_task_retry_deadline_explicit = "retry_deadline_seconds" in options  # type: ignore[attr-defined]
            self.tasks[name] = function
            return function

        if decorator_args and callable(decorator_args[0]) and len(decorator_args) == 1:
            return register(decorator_args[0])
        return register


job_task_registry = JobTaskRegistry()
