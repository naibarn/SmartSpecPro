"""FastAPI endpoint for triggering on-demand agency review analysis.

Internal service-to-service endpoint — requires X-Internal-Token auth.
Produces a structured improvement review that the web app can store as
review feedback and surface in the Agency Review Center.
"""

from __future__ import annotations

import json
import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services.agency_improvement_advisor import check_agency_health

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/agency", tags=["agency-review"])


async def _verify_internal_token(
    x_internal_token: Optional[str] = Header(None),
) -> bool:
    expected = settings.SMARTSPEC_WEB_GATEWAY_TOKEN
    if not expected:
        raise HTTPException(status_code=500, detail="Gateway token not configured")
    if not x_internal_token:
        raise HTTPException(status_code=401, detail="Missing X-Internal-Token")
    if not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="Invalid token")
    return True


class ReviewAgencyRequest(BaseModel):
    agency_id: str
    tenant_id: str


def _priority_from_severity(severity: Any) -> str:
    normalized = str(severity or "medium").lower()
    if normalized not in {"high", "medium", "low"}:
        return "medium"
    return normalized


def _build_suggestion_category(text: str, fallback: str = "output_quality") -> str:
    lowered = text.lower()
    if "model" in lowered:
        return "model_selection"
    if "instruction" in lowered or "prompt" in lowered:
        return "node_instructions"
    if "objective" in lowered:
        return "objective_refinement"
    return fallback


def _convert_analysis(raw: dict[str, Any]) -> dict[str, Any]:
    issues = [issue for issue in (raw.get("issues") or []) if isinstance(issue, dict)]
    model_recommendations = [rec for rec in (raw.get("modelRecommendations") or []) if isinstance(rec, dict)]
    suggestions: list[dict[str, Any]] = []

    for issue in issues[:5]:
        recommendation = str(issue.get("recommendation") or issue.get("issue") or "Review this issue")
        suggestions.append(
            {
                "category": _build_suggestion_category(recommendation),
                "suggestion": recommendation,
                "priority": _priority_from_severity(issue.get("severity")),
                "autoApplyable": False,
                "targetNodeId": None,
                "resolved": False,
            }
        )

    for rec in model_recommendations[:5]:
        node_id = rec.get("nodeId")
        current_model = rec.get("currentModel") or "unknown model"
        suggested_model = rec.get("suggestedModel") or "review candidate"
        reason = rec.get("reason") or "A newer model may improve the agency."
        suggestion_text = f"Consider changing node {node_id} from {current_model} to {suggested_model}. {reason}"
        suggestions.append(
            {
                "category": "model_selection",
                "suggestion": suggestion_text,
                "priority": "medium",
                "autoApplyable": False,
                "targetNodeId": None,
                "resolved": False,
            }
        )

    if not suggestions:
        suggestions.append(
            {
                "category": "output_quality",
                "suggestion": "No major issues were detected. Run another live test after the next change to confirm performance stays stable.",
                "priority": "low",
                "autoApplyable": False,
                "targetNodeId": None,
                "resolved": False,
            }
        )

    health_score = raw.get("healthScore")
    objective_alignment = raw.get("objectiveAlignment")
    score = health_score if isinstance(health_score, (int, float)) else objective_alignment
    if not isinstance(score, (int, float)):
        score = 0.5

    overall = raw.get("overallAssessment") or raw.get("summary") or "Agency review completed."
    return {
        "suggestions": suggestions,
        "objectiveAlignment": float(score),
        "overallAssessment": str(overall),
        "analyzedAt": datetime.now(timezone.utc).isoformat(),
        "healthScore": health_score,
        "issues": issues[:8],
        "modelRecommendations": model_recommendations[:8],
        "source": "manual_agency_review",
    }


@router.post("/review-agency", dependencies=[Depends(_verify_internal_token)])
async def review_agency_endpoint(req: ReviewAgencyRequest):
    """Trigger an on-demand LLM review of an agency.

    The web app uses this to create a review record that can be inspected,
    approved, or dismissed in the Agency Review Center.
    """
    try:
        from openai import AsyncOpenAI

        base_url = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")
        gateway_client = AsyncOpenAI(
            api_key="internal",
            base_url=f"{base_url}/api/llm/v1",
        )

        async with AsyncSessionLocal() as session:
            raw = await check_agency_health(
                db=session,
                gateway_client=gateway_client,
                model_name="gpt-4o-mini",
                agency_id=req.agency_id,
                tenant_id=req.tenant_id,
            )

        if raw is None:
            raise HTTPException(status_code=404, detail="Agency not found or no health data available")

        analysis = _convert_analysis(raw if isinstance(raw, dict) else json.loads(json.dumps(raw)))
        return {
            "status": "reviewed",
            "analysis": analysis,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("review_agency_endpoint_error", error=str(exc)[:200])
        raise HTTPException(status_code=500, detail="Agency review failed")
