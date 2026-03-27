"""FastAPI endpoint for triggering async feedback analysis.

Internal service-to-service endpoint — requires X-Internal-Token auth.
"""

from __future__ import annotations

import os
import secrets
import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Depends
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/agency", tags=["agency-feedback"])


async def _verify_internal_token(
    x_internal_token: Optional[str] = Header(None),
) -> bool:
    """Verify service-to-service token (same pattern as internal_guardrails)."""
    expected = settings.SMARTSPEC_WEB_GATEWAY_TOKEN
    if not expected:
        raise HTTPException(status_code=500, detail="Gateway token not configured")
    if not x_internal_token:
        raise HTTPException(status_code=401, detail="Missing X-Internal-Token")
    if not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="Invalid token")
    return True


class AnalyzeFeedbackRequest(BaseModel):
    feedback_id: int
    agency_id: str
    tenant_id: str


@router.post("/analyze-feedback", dependencies=[Depends(_verify_internal_token)])
async def analyze_feedback_endpoint(req: AnalyzeFeedbackRequest):
    """Trigger LLM analysis of user feedback for an agency run.

    Called by Node.js backend after user submits feedback.
    Runs analysis and stores suggestions in the feedback row.
    """
    try:
        from openai import AsyncOpenAI
        from app.core.database import AsyncSessionLocal
        from app.services.agency_improvement_advisor import analyze_feedback

        base_url = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")
        gateway_client = AsyncOpenAI(
            api_key="internal",
            base_url=f"{base_url}/api/llm/v1",
        )

        async with AsyncSessionLocal() as session:
            result = await analyze_feedback(
                db=session,
                gateway_client=gateway_client,
                model_name="gpt-4o-mini",
                feedback_id=req.feedback_id,
                agency_id=req.agency_id,
                tenant_id=req.tenant_id,
            )

        if result is None:
            raise HTTPException(status_code=404, detail="Feedback or agency not found")

        return {
            "status": "analyzed",
            "suggestions_count": len(result.get("suggestions", [])),
            "objective_alignment": result.get("objectiveAlignment", 0),
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("analyze_feedback_endpoint_error", error=str(exc)[:200])
        raise HTTPException(status_code=500, detail="Analysis failed")
