"""Celery periodic task: Agency Health Monitor.

Weekly check of all active agencies — analyzes performance trends,
model freshness, and generates improvement notifications.
"""

from __future__ import annotations

import asyncio
import logging

from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="agency.health_monitor", bind=True, max_retries=1)
def agency_health_monitor(self):
    """Weekly health check for all active agencies with recent runs."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    result = loop.run_until_complete(_run_health_monitor())
    logger.info("agency_health_monitor_complete", extra=result)
    return result


async def _run_health_monitor() -> dict:
    """Check health of agencies with recent activity."""
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal

    total = {"agencies_checked": 0, "issues_found": 0, "notifications_sent": 0}

    # Find agencies with runs in the last 30 days
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text(
                'SELECT DISTINCT art."agencyId", art."tenantId", a."createdBy" '
                'FROM agency_run_traces art '
                'JOIN agencies a ON a.id = art."agencyId" '
                'WHERE art."createdAt" > NOW() - INTERVAL \'30 days\' '
                'AND a.status = \'published\' '
                'LIMIT 100'
            ),
        )
        agencies = result.fetchall()

    for row in agencies:
        agency_id, tenant_id, created_by = row[0], row[1], row[2]
        try:
            analysis = await _check_single_agency(agency_id, tenant_id)
            total["agencies_checked"] += 1

            if analysis and analysis.get("issues"):
                issues = analysis["issues"]
                total["issues_found"] += len(issues)

                # Store health report + notify (skip if no valid owner)
                if created_by:
                    await _store_health_report(agency_id, tenant_id, created_by, analysis)
                    high_issues = [i for i in issues if i.get("severity") == "high"]
                    if high_issues:
                        await _notify_owner(tenant_id, created_by, agency_id, high_issues)
                    total["notifications_sent"] += 1

        except Exception as exc:
            logger.debug("health_check_agency_failed", agency_id=agency_id, error=str(exc)[:120])

    return total


async def _check_single_agency(agency_id: str, tenant_id: str) -> dict | None:
    """Run health check on a single agency."""
    import os
    from openai import AsyncOpenAI
    from app.core.database import AsyncSessionLocal
    from app.services.agency_improvement_advisor import check_agency_health

    base_url = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")
    gateway_client = AsyncOpenAI(
        api_key="internal",
        base_url=f"{base_url}/api/llm/v1",
    )

    async with AsyncSessionLocal() as session:
        return await check_agency_health(
            db=session,
            gateway_client=gateway_client,
            model_name="gpt-4o-mini",
            agency_id=agency_id,
            tenant_id=tenant_id,
        )


async def _store_health_report(
    agency_id: str, tenant_id: str, user_id: int, analysis: dict,
) -> None:
    """Store health check findings as agency-wide memories."""
    from app.core.database import AsyncSessionLocal
    from app.services.long_term_memory import LongTermMemoryService

    issues = analysis.get("issues", [])
    if not issues:
        return

    async with AsyncSessionLocal() as session:
        service = LongTermMemoryService(db_session=session)
        from app.services.agentic_sanitizer import sanitize_llm_input as _sanitize
        for issue in issues[:3]:
            recommendation = _sanitize(issue.get("recommendation", issue.get("issue", "")), max_length=500)
            await service.save_memory(
                tenant_id=tenant_id,
                agency_id=agency_id,
                agent_node_id="__health_monitor__",
                user_id=user_id,
                content=f"[Health Check] {recommendation}",
                memory_type="insight",
                source_run_id="health_monitor",
                confidence=0.6,
            )


async def _notify_owner(
    tenant_id: str, user_id: int, agency_id: str, issues: list[dict],
) -> None:
    """Create in-app notification for agency owner about health issues."""
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal

    from app.services.agentic_sanitizer import sanitize_llm_input
    issue_lines = "\n".join(
        f"  {i+1}. {sanitize_llm_input(iss.get('recommendation', iss.get('issue', '')), max_length=300)}"
        for i, iss in enumerate(issues[:5])
    )
    message = f"Agency health check found issues:\n{issue_lines}\n\nWould you like to review and apply improvements?"

    async with AsyncSessionLocal() as session:
        # Get agency name for the notification
        result = await session.execute(
            text('SELECT name FROM agencies WHERE id = :id'), {"id": agency_id},
        )
        row = result.fetchone()
        agency_name = row[0] if row else "Unknown"

        try:
            await session.execute(
                text(
                    'INSERT INTO notifications '
                    '("tenantId", "userId", title, message, type, "resourceType", "resourceId", "createdAt") '
                    'VALUES (:tid, :uid, :title, :msg, :type, :rtype, :rid, NOW())'
                ),
                {
                    "tid": tenant_id,
                    "uid": user_id,
                    "title": f"Agency '{agency_name}' needs attention",
                    "msg": message,
                    "type": "agency_health",
                    "rtype": "agency",
                    "rid": agency_id,
                },
            )
            await session.commit()
        except Exception as exc:
            logger.debug("health_notification_failed", error=str(exc)[:120])
