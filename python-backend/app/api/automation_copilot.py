"""FastAPI endpoints for the Automation Copilot feature.

Five endpoints with X-Internal-Token auth:
  POST /analyze   — Parse prompt into intent
  GET  /status    — Get task status
  POST /execute   — Generate + run automation
  POST /cancel    — Cancel running task
  GET  /templates — List saved templates
"""

from __future__ import annotations

import json
import secrets
import uuid
from typing import Optional

import redis as sync_redis
import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.config import settings

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["Automation Copilot"])

_REDIS_URL = getattr(settings, "CELERY_BROKER_URL", None) or "redis://localhost:6379/0"
_RESULT_TTL = 3600


def _get_redis() -> sync_redis.Redis:
    return sync_redis.Redis.from_url(_REDIS_URL, decode_responses=True)


# ── Auth ──────────────────────────────────────────────────────────────────


async def _verify_internal_token(
    x_internal_token: Optional[str] = Header(None),
    x_proxy_token: Optional[str] = Header(None),
) -> None:
    expected = (
        getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
        or getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", None)
    )
    if not expected:
        raise HTTPException(status_code=500, detail="Internal token not configured")
    token = x_internal_token or x_proxy_token
    if not token:
        raise HTTPException(status_code=401, detail=json.dumps({"error": "Missing internal token", "code": "unauthorized"}))
    if not secrets.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail=json.dumps({"error": "Invalid internal token", "code": "unauthorized"}))


# ── Request/Response Models ───────────────────────────────────────────────


class AnalyzeRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=10000)
    tenant_id: str = Field(..., max_length=100)
    user_id: int
    user_jwt: str


class CostEstimate(BaseModel):
    estimated_credits: int
    breakdown: dict[str, int]
    max_possible_credits: int


class ExecuteRequest(BaseModel):
    task_id: str
    execution_id: str
    intent_json: str
    user_jwt: str
    tenant_id: str = Field(..., max_length=100)
    user_id: int
    vision_model: str = Field(default="gpt-4o", max_length=100)
    allowed_domains: list[str] = Field(default_factory=list)
    reservation_id: str | None = None


class CancelRequest(BaseModel):
    tenant_id: str = Field(..., max_length=100)


# ── Endpoints ─────────────────────────────────────────────────────────────


@router.post("/analyze")
async def analyze(
    body: AnalyzeRequest,
    _: None = Depends(_verify_internal_token),
):
    """Parse prompt into automation intent."""
    from app.tasks.automation_copilot_task import automation_analyze_task

    # Feature flag check
    r = _get_redis()
    flag = r.get(f"feature_flag:automationCopilot:{body.tenant_id}")
    if flag == "0":
        raise HTTPException(
            status_code=403,
            detail=json.dumps({"error": "Automation Copilot is disabled", "code": "feature_disabled"}),
        )

    task_id = f"auto-{uuid.uuid4().hex[:12]}"
    r.set(
        f"automation:{task_id}",
        json.dumps({"status": "queued", "tenant_id": body.tenant_id, "user_id": body.user_id}),
        ex=_RESULT_TTL,
    )

    automation_analyze_task.delay(
        task_id, body.user_jwt, body.user_id, body.tenant_id, body.prompt
    )
    logger.info("automation_analyze_enqueued", task_id=task_id, tenant_id=body.tenant_id)
    return {"task_id": task_id}


@router.get("/status/{task_id}")
async def get_status(
    task_id: str,
    tenant_id: str = Query(...),
    _: None = Depends(_verify_internal_token),
):
    """Get automation task status."""
    r = _get_redis()
    raw = r.get(f"automation:{task_id}")
    if raw is None:
        raise HTTPException(
            status_code=404,
            detail=json.dumps({"error": "Task not found", "code": "not_found"}),
        )

    data = json.loads(raw)
    stored_tenant = data.get("tenant_id")
    if not stored_tenant or stored_tenant != tenant_id:
        raise HTTPException(
            status_code=403,
            detail=json.dumps({"error": "Access denied", "code": "forbidden"}),
        )

    # Strip internal keys
    result = {k: v for k, v in data.items() if not k.startswith("_")}

    # Add cost estimate when intent is available
    if result.get("status") in ("ready", "preview_ready") and result.get("intent"):
        intent = result["intent"] if isinstance(result["intent"], dict) else {}
        steps = intent.get("steps", [])
        browser_tasks = intent.get("browser_tasks", steps)
        num_browser_tasks = len(browser_tasks) if isinstance(browser_tasks, list) else 0
        num_llm_calls = num_browser_tasks + 1
        num_web_searches = len(intent.get("search_tasks", [])) if isinstance(intent.get("search_tasks"), list) else 0

        estimated = (num_browser_tasks * 15) + (num_llm_calls * 5) + (num_web_searches * 10)
        max_possible = int(estimated * 1.5) + 20

        result["cost_estimate"] = {
            "estimated_credits": estimated,
            "breakdown": {
                "browser_actions": num_browser_tasks * 15,
                "llm_calls": num_llm_calls * 5,
                "web_searches": num_web_searches * 10,
            },
            "max_possible_credits": max_possible,
        }

    return result


@router.post("/execute")
async def execute(
    body: ExecuteRequest,
    _: None = Depends(_verify_internal_token),
):
    """Generate and execute automation scripts."""
    from app.tasks.automation_copilot_task import automation_execute_task

    r = _get_redis()
    flag = r.get(f"feature_flag:automationCopilot:{body.tenant_id}")
    if flag == "0":
        raise HTTPException(
            status_code=403,
            detail=json.dumps({"error": "Automation Copilot is disabled", "code": "feature_disabled"}),
        )

    automation_execute_task.delay(
        body.task_id,
        body.execution_id,
        body.user_jwt,
        body.user_id,
        body.tenant_id,
        body.intent_json,
        body.vision_model,
        body.allowed_domains,
        body.reservation_id,
    )
    logger.info("automation_execute_enqueued", task_id=body.task_id, tenant_id=body.tenant_id)
    return {"ok": True}


@router.post("/cancel/{task_id}")
async def cancel(
    task_id: str,
    body: CancelRequest,
    _: None = Depends(_verify_internal_token),
):
    """Cancel a running automation task."""
    r = _get_redis()

    # Verify task exists and tenant matches
    raw = r.get(f"automation:{task_id}")
    if raw is None:
        raise HTTPException(
            status_code=404,
            detail=json.dumps({"error": "Task not found", "code": "not_found"}),
        )

    data = json.loads(raw)
    stored_tenant = data.get("tenant_id")
    if not stored_tenant or stored_tenant != body.tenant_id:
        raise HTTPException(
            status_code=403,
            detail=json.dumps({"error": "Access denied", "code": "forbidden"}),
        )

    r.set(f"automation:{task_id}:cancel", "1", ex=_RESULT_TTL)
    logger.info("automation_cancelled", task_id=task_id, tenant_id=body.tenant_id)
    return {"cancelled": True}


@router.get("/templates")
async def list_templates(
    tenant_id: str = Query(...),
    limit: int = Query(default=20, le=100, ge=1),
    cursor: str | None = Query(default=None),
    _: None = Depends(_verify_internal_token),
):
    """List automation templates for a tenant.

    Uses timestamp cursor pagination (created_at DESC).
    Returns both tenant-owned and public templates.
    Falls back to an empty list if the table does not yet exist.
    """
    from sqlalchemy import text
    from sqlalchemy.exc import ProgrammingError

    from app.core.database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as session:
            params: dict = {"tenant_id": tenant_id, "limit": limit + 1}

            cursor_clause = ""
            if cursor:
                cursor_clause = "AND created_at < :cursor"
                params["cursor"] = cursor

            query = text(
                f"""
                SELECT id, tenant_id, user_id, name, description,
                       intent, scripts, thumbnail_url, is_public,
                       usage_count, last_used_at, created_at, updated_at
                FROM automation_templates
                WHERE (tenant_id = :tenant_id OR is_public = true)
                {cursor_clause}
                ORDER BY created_at DESC
                LIMIT :limit
                """
            )

            result = await session.execute(query, params)
            rows = result.mappings().all()

    except ProgrammingError:
        # Table does not exist yet — migration has not been applied.
        logger.warning("automation_templates_table_missing", tenant_id=tenant_id)
        return {"templates": [], "next_cursor": None}

    templates = []
    for row in rows[:limit]:
        templates.append(
            {
                "id": str(row["id"]),
                "tenant_id": row["tenant_id"],
                "user_id": row["user_id"],
                "name": row["name"],
                "description": row["description"],
                "intent": row["intent"],
                "scripts": row["scripts"],
                "thumbnail_url": row["thumbnail_url"],
                "is_public": row["is_public"],
                "usage_count": row["usage_count"],
                "last_used_at": row["last_used_at"].isoformat() if row["last_used_at"] else None,
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            }
        )

    has_more = len(rows) > limit
    next_cursor = templates[-1]["created_at"] if has_more and templates else None

    logger.info("automation_templates_listed", tenant_id=tenant_id, count=len(templates))
    return {"templates": templates, "next_cursor": next_cursor}
