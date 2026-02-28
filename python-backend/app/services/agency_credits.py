"""
Agency credit management -- pre-check and multiplier markup.

Credit flow:
1. Pre-check (before run): estimate cost, check balance via Node.js gateway.
2. Per-call deduction (during run): handled by adapter gateway routing.
3. Multiplier markup (after run): deduct additional markup via internal endpoint.

Pre-check is advisory only (no reservation).
Markup failures are logged but do not fail the run (post-deduct pattern).
"""

import structlog
import httpx

logger = structlog.get_logger(__name__)

# Conservative cost-per-token estimates (USD) for pre-check estimation.
# Intentionally overestimated to prevent mid-run credit exhaustion.
_MODEL_COST_PER_TOKEN: dict[str, float] = {
    "gpt-4o": 0.00001,
    "gpt-4o-mini": 0.000002,
    "gpt-4-turbo": 0.00003,
    "gpt-3.5-turbo": 0.000002,
}
_DEFAULT_COST_PER_TOKEN = 0.00001


class AgencyCreditManager:
    """Manages credit pre-checks and multiplier markup for agency runs."""

    def __init__(self, gateway_url: str, gateway_token: str):
        self._gateway_url = gateway_url.rstrip("/") if gateway_url else ""
        self._gateway_token = gateway_token

    async def pre_check(self, user_id: int, estimated_cost: float) -> bool:
        """Check user has enough credits for estimated run cost.

        Makes an HTTP call to Node.js gateway to check balance.
        Does NOT reserve credits.

        Returns True (optimistic) if gateway is unreachable or not configured.
        """
        if not self._gateway_url or not self._gateway_token:
            logger.warning(
                "agency_credit_precheck_skipped",
                reason="gateway_not_configured",
                user_id=user_id,
            )
            return True

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{self._gateway_url}/api/internal/credits/balance",
                    params={"userId": user_id},
                    headers={"Authorization": f"Bearer {self._gateway_token}"},
                )

            if resp.status_code == 200:
                data = resp.json()
                balance = float(data.get("balance", 0))
                has_enough = balance >= estimated_cost

                logger.info(
                    "agency_credit_precheck",
                    user_id=user_id,
                    balance=balance,
                    estimated_cost=estimated_cost,
                    sufficient=has_enough,
                )
                return has_enough

            logger.warning(
                "agency_credit_precheck_failed",
                user_id=user_id,
                status=resp.status_code,
            )
            return True  # Optimistic on non-200

        except Exception as exc:
            logger.warning(
                "agency_credit_precheck_error",
                user_id=user_id,
                error=str(exc),
            )
            return True  # Optimistic on error

    async def apply_multiplier_markup(
        self,
        user_id: int,
        agency_id: str,
        total_gateway_cost: float,
        multiplier: float,
    ) -> None:
        """Deduct agency markup at run completion.

        Markup = (total_gateway_cost * multiplier) - total_gateway_cost.
        If multiplier is 1.0, this is a no-op.
        Failures are logged but do not raise (post-deduct pattern).
        """
        markup = (total_gateway_cost * multiplier) - total_gateway_cost
        if markup <= 0:
            return

        if not self._gateway_url or not self._gateway_token:
            logger.warning(
                "agency_markup_skipped",
                reason="gateway_not_configured",
                user_id=user_id,
                agency_id=agency_id,
                markup=markup,
            )
            return

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{self._gateway_url}/api/internal/credits/agency-markup",
                    json={
                        "userId": user_id,
                        "agencyId": agency_id,
                        "markupAmount": markup,
                        "sourceType": "agency",
                    },
                    headers={"Authorization": f"Bearer {self._gateway_token}"},
                )

            if resp.status_code == 200:
                logger.info(
                    "agency_markup_applied",
                    user_id=user_id,
                    agency_id=agency_id,
                    markup=markup,
                    multiplier=multiplier,
                )
            else:
                logger.error(
                    "agency_markup_failed",
                    user_id=user_id,
                    agency_id=agency_id,
                    status=resp.status_code,
                    markup=markup,
                )

        except Exception as exc:
            logger.error(
                "agency_markup_error",
                user_id=user_id,
                agency_id=agency_id,
                error=str(exc),
                markup=markup,
            )

    async def settle_creator_fee(
        self,
        run_id: str,
        agency_id: str,
        user_id: int,
        creator_id: int,
        creator_fee_credits: int,
        platform_share_pct: int,
        tenant_id: str,
    ) -> None:
        """Call Node.js gateway to settle creator fee after successful run.

        Failures are logged but do not fail the run (post-settle pattern).
        Skips when fee=0 or runner is the creator.
        """
        if creator_fee_credits <= 0 or user_id == creator_id:
            return

        if not self._gateway_url or not self._gateway_token:
            logger.warning(
                "creator_fee_settle_skipped",
                reason="gateway_not_configured",
                run_id=run_id,
                agency_id=agency_id,
            )
            return

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{self._gateway_url}/api/internal/credits/creator-fee-settle",
                    json={
                        "runId": run_id,
                        "agencyId": agency_id,
                        "userId": user_id,
                        "creatorId": creator_id,
                        "creatorFeeCredits": creator_fee_credits,
                        "platformSharePct": platform_share_pct,
                        "tenantId": tenant_id,
                    },
                    headers={"Authorization": f"Bearer {self._gateway_token}"},
                )

            if resp.status_code == 200:
                data = resp.json()
                logger.info(
                    "creator_fee_settled",
                    run_id=run_id,
                    agency_id=agency_id,
                    user_id=user_id,
                    creator_id=creator_id,
                    status=data.get("status"),
                    actual_charged=data.get("actualCharged"),
                    creator_share=data.get("creatorShare"),
                )
            else:
                logger.error(
                    "creator_fee_settle_failed",
                    run_id=run_id,
                    agency_id=agency_id,
                    status=resp.status_code,
                    body=resp.text[:200],
                )

        except Exception as exc:
            logger.error(
                "creator_fee_settle_error",
                run_id=run_id,
                agency_id=agency_id,
                error=str(exc),
            )

    def estimate_run_cost(
        self,
        agent_count: int,
        avg_tokens_per_agent: int = 2000,
        model: str = "gpt-4o-mini",
    ) -> float:
        """Estimate cost for pre-check. Conservative overestimate.

        Uses: agent_count * avg_tokens * model_cost_per_token.
        """
        cost_per_token = _MODEL_COST_PER_TOKEN.get(model, _DEFAULT_COST_PER_TOKEN)
        return agent_count * avg_tokens_per_agent * cost_per_token
