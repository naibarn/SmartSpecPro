"""Compatibility import for the Feature 186 thin Celery wrapper.

New task families should import from ``unified_job_task`` while this stable
module path keeps the implementation-plan boundary usable by older callers.
"""

from app.tasks.unified_job_task import execute_unified_job, register_unified_executor

__all__ = ["execute_unified_job", "register_unified_executor"]
