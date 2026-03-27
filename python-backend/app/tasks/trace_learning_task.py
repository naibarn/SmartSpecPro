"""Celery periodic task: Analyze agency run traces and extract operational insights.

Runs daily — reads recent traces, identifies patterns (slow tools, frequent failures,
cost outliers), and stores them as agency-wide memories for future runs.
"""

from __future__ import annotations

import asyncio
import json
import logging

from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)

TRACE_ANALYSIS_LOOKBACK_DAYS = 7
MIN_RUNS_FOR_ANALYSIS = 3


@celery_app.task(name="agency.analyze_run_traces", bind=True, max_retries=1)
def analyze_run_traces(self):
    """Analyze recent run traces and extract operational patterns."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    result = loop.run_until_complete(_run_trace_analysis())
    logger.info("trace_analysis_complete", extra=result)
    return result


async def _run_trace_analysis() -> dict:
    """Analyze run traces per agency and extract operational insights."""
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal

    total = {"agencies_analyzed": 0, "insights_stored": 0}

    async with AsyncSessionLocal() as session:
        # Get agencies with enough recent runs
        result = await session.execute(
            text(
                'SELECT "agencyId", "tenantId", count(*) as run_count '
                'FROM agency_run_traces '
                'WHERE "createdAt" > NOW() - INTERVAL :days '
                'GROUP BY "agencyId", "tenantId" '
                'HAVING count(*) >= :min_runs '
                'ORDER BY count(*) DESC LIMIT 50'
            ),
            {"days": f"{TRACE_ANALYSIS_LOOKBACK_DAYS} days", "min_runs": MIN_RUNS_FOR_ANALYSIS},
        )
        agency_rows = result.fetchall()

    for row in agency_rows:
        agency_id, tenant_id, run_count = row[0], row[1], row[2]

        try:
            insights = await _analyze_agency_traces(agency_id, tenant_id)
            if insights:
                stored = await _store_trace_insights(agency_id, tenant_id, insights)
                total["insights_stored"] += stored
            total["agencies_analyzed"] += 1
        except Exception as exc:
            logger.debug(
                "trace_analysis_agency_failed",
                agency_id=agency_id,
                error=str(exc)[:120],
            )

    return total


async def _analyze_agency_traces(agency_id: str, tenant_id: str) -> list[dict]:
    """Analyze traces for a single agency and return operational insights."""
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text(
                'SELECT trace, status, "durationMs", "totalTokens", "totalCost" '
                'FROM agency_run_traces '
                'WHERE "agencyId" = :agency_id AND "tenantId" = :tenant_id '
                'AND "createdAt" > NOW() - INTERVAL :days '
                'ORDER BY "createdAt" DESC LIMIT 20'
            ),
            {
                "agency_id": agency_id,
                "tenant_id": tenant_id,
                "days": f"{TRACE_ANALYSIS_LOOKBACK_DAYS} days",
            },
        )
        traces = result.fetchall()

    if not traces:
        return []

    # Aggregate statistics
    statuses = {}
    total_duration = 0
    total_cost = 0.0
    tool_failures: dict[str, int] = {}
    slow_tools: dict[str, list[int]] = {}

    for trace_row in traces:
        trace_data, status, duration_ms, total_tokens, cost = (
            trace_row[0], trace_row[1], trace_row[2] or 0, trace_row[3] or 0, float(trace_row[4] or 0),
        )
        statuses[status] = statuses.get(status, 0) + 1
        total_duration += duration_ms
        total_cost += cost

        # Parse trace spans for tool-level analysis
        if isinstance(trace_data, dict):
            spans = trace_data.get("spans", [])
            if isinstance(spans, list):
                for span in spans:
                    if not isinstance(span, dict):
                        continue
                    span_type = span.get("type", "")
                    span_name = span.get("name", "")
                    span_duration = span.get("duration_ms", 0) or 0
                    span_error = span.get("error")

                    if span_type == "tool_call" and span_name:
                        if span_error:
                            tool_failures[span_name] = tool_failures.get(span_name, 0) + 1
                        if span_duration > 5000:  # > 5s
                            slow_tools.setdefault(span_name, []).append(span_duration)

    # Generate insights
    insights: list[dict] = []
    run_count = len(traces)
    avg_duration = total_duration / run_count if run_count else 0
    fail_count = statuses.get("failed", 0) + statuses.get("timeout", 0)

    # Failure rate insight
    if fail_count > 0:
        fail_rate = fail_count / run_count
        if fail_rate > 0.3:
            insights.append({
                "content": f"High failure rate ({fail_rate:.0%}) in recent {run_count} runs. "
                           f"Statuses: {json.dumps(statuses)}. Consider reviewing agent instructions.",
                "memory_type": "strategy_failure",
            })

    # Tool failure patterns
    for tool_name, fail_count in sorted(tool_failures.items(), key=lambda x: -x[1]):
        if fail_count >= 2:
            insights.append({
                "content": f"Tool '{tool_name}' failed {fail_count} times in recent runs. "
                           f"Check if the tool endpoint is healthy or parameters are correct.",
                "memory_type": "constraint",
            })

    # Slow tool patterns
    for tool_name, durations in slow_tools.items():
        if len(durations) >= 2:
            avg_ms = sum(durations) / len(durations)
            insights.append({
                "content": f"Tool '{tool_name}' is consistently slow (avg {avg_ms/1000:.1f}s). "
                           f"Consider caching results or using a faster alternative.",
                "memory_type": "insight",
            })

    # Cost insight
    avg_cost = total_cost / run_count if run_count else 0
    if avg_cost > 0.10:  # > $0.10 per run
        insights.append({
            "content": f"Average cost per run is ${avg_cost:.3f} ({run_count} runs). "
                       f"Consider using cheaper models for less complex nodes.",
            "memory_type": "insight",
        })

    return insights[:5]  # Cap at 5 insights per analysis


async def _store_trace_insights(
    agency_id: str, tenant_id: str, insights: list[dict],
) -> int:
    """Store trace analysis insights as agency-wide memories."""
    from app.core.database import AsyncSessionLocal
    from app.services.long_term_memory import LongTermMemoryService

    stored = 0
    async with AsyncSessionLocal() as session:
        service = LongTermMemoryService(db_session=session)

        # Find a user to associate with (use agency creator)
        from sqlalchemy import text
        result = await session.execute(
            text('SELECT "createdBy" FROM agencies WHERE id = :id AND "tenantId" = :tid'),
            {"id": agency_id, "tid": tenant_id},
        )
        row = result.fetchone()
        user_id = row[0] if row else 1

        for insight in insights:
            try:
                saved = await service.save_memory(
                    tenant_id=tenant_id,
                    agency_id=agency_id,
                    agent_node_id="__trace_analysis__",  # Agency-wide, not node-specific
                    user_id=user_id,
                    content=insight["content"],
                    memory_type=insight["memory_type"],
                    source_run_id="trace_analysis",
                    confidence=0.7,  # Lower confidence — needs validation by usage
                )
                if saved:
                    stored += 1
            except Exception:
                pass

    return stored
