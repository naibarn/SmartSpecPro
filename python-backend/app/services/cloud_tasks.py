"""Retired Google Cloud task compatibility surface.

The Python runtime now receives canonical Feature 186 jobs through the
PostgreSQL/Cloudflare boundary. This module remains import-compatible for
unmounted legacy handlers, but it cannot publish work.
"""

QUEUE_CONFIGS: dict[str, dict[str, int]] = {}


async def enqueue_task(*_args, **_kwargs) -> str:
    raise RuntimeError(
        "GOOGLE_CLOUD_RUNTIME_RETIRED: create a canonical worker_jobs outbox intent"
    )
