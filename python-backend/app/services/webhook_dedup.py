"""PostgreSQL-backed deduplication for provider webhooks."""

from app.services.postgres_rate_limit import (
    is_ttl_dedupe_key_present,
    mark_ttl_dedupe_key,
)

DEDUP_TTL_SECONDS = 86400
DEDUP_NAMESPACE = "kie_webhook"


class WebhookDedupService:
    """Check and store Kie.ai webhook markers with a 24-hour TTL."""

    async def is_duplicate(self, kie_job_id: str) -> bool:
        return await is_ttl_dedupe_key_present(DEDUP_NAMESPACE, kie_job_id)

    async def mark_processed(self, kie_job_id: str) -> None:
        await mark_ttl_dedupe_key(DEDUP_NAMESPACE, kie_job_id, DEDUP_TTL_SECONDS)
