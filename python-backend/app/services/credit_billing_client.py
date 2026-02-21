"""
Credit billing client -- calls Node.js internal credit endpoint.

Post-deduct pattern: charges credits after successful operation.
Failures are logged but do not fail the parent operation.
"""

import logging
from typing import Any, Dict, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


async def charge_credits_post_deduct(
    user_id: int,
    chunk_count: Optional[int] = None,
    amount: Optional[int] = None,
    service: str = "library.upload_index",
    idempotency_key: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    source_type: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Charge credits via the Node.js internal endpoint.

    Post-deduct: if billing fails, the operation is NOT rolled back.
    The failure is logged for manual reconciliation.
    """
    base_url = (settings.SMARTSPEC_WEB_GATEWAY_URL or "").rstrip("/")
    token = settings.SMARTSPEC_WEB_GATEWAY_TOKEN or ""

    if not base_url or not token:
        logger.warning(
            "credit_billing_skipped: SMARTSPEC_WEB_GATEWAY_URL or TOKEN not configured",
            extra={"user_id": user_id, "service": service},
        )
        return None

    payload: Dict[str, Any] = {
        "userId": user_id,
        "service": service,
    }
    if chunk_count is not None:
        payload["chunkCount"] = chunk_count
    if amount is not None:
        payload["amount"] = amount
    if idempotency_key:
        payload["idempotencyKey"] = idempotency_key
    if metadata:
        payload["metadata"] = metadata
    if source_type:
        payload["sourceType"] = source_type

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{base_url}/api/internal/credits/charge",
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
            )

        if resp.status_code == 200:
            data = resp.json()
            logger.info(
                "credit_billing_success",
                extra={
                    "user_id": user_id,
                    "service": service,
                    "credits_used": data.get("creditsUsed", 0),
                },
            )
            return data
        else:
            logger.warning(
                "credit_billing_failed",
                extra={
                    "user_id": user_id,
                    "service": service,
                    "status": resp.status_code,
                    "response": resp.text[:200],
                },
            )
            return None

    except Exception as exc:
        logger.error(
            "credit_billing_error",
            extra={"user_id": user_id, "service": service, "error": str(exc)},
        )
        return None
