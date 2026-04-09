"""Skill discovery node handler for agency orchestrator.

Calls the Node.js skill-discovery internal endpoint to find matching skills,
filters by confidence threshold, and stores results in AgencyRunContext.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
import structlog

from app.services.agency_run_context import AgencyRunContext

logger = structlog.get_logger(__name__)

MAX_RESULTS_CAP = 10


def _dedupe_skills(skills: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep the highest-confidence record for each discovered skill."""
    deduped: dict[str, dict[str, Any]] = {}
    for skill in skills:
        skill_id = str(skill.get("id") or skill.get("slug") or skill.get("name") or "").strip()
        if not skill_id:
            continue
        current = deduped.get(skill_id)
        if current is None or float(skill.get("confidence", 0)) > float(current.get("confidence", 0)):
            deduped[skill_id] = skill
    return list(deduped.values())


async def execute_skill_discovery(
    *,
    node_name: str,
    node_config: dict[str, Any],
    context: AgencyRunContext,
    results: dict[str, Any],
) -> str:
    """Execute a skill_discovery node: find skills matching a task description.

    Returns a summary string as node output and stores the full result list
    in context under '{node_name}_discovered'.
    """
    task_source = node_config.get("taskSource", "static")
    confidence_threshold = float(node_config.get("confidenceThreshold", 0.7))
    max_results = min(int(node_config.get("maxResults", 5)), MAX_RESULTS_CAP)
    skill_categories: list[str] = node_config.get("skillCategories") or []

    # Resolve task description
    task_description = await _resolve_task(task_source, node_config, context, results)
    if not task_description:
        await context.set(f"{node_name}_discovered", [])
        return "Skill discovery: no task description provided"

    # Build request
    nodejs_url = os.getenv("NODEJS_INTERNAL_URL", "http://127.0.0.1:3000")
    internal_token = os.getenv("SMARTSPEC_WEB_GATEWAY_TOKEN", "")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            request_bodies: list[dict[str, Any]] = []
            if skill_categories:
                request_bodies.extend({
                    "description": task_description,
                    "limit": max_results,
                    "category": category,
                } for category in skill_categories)
            else:
                request_bodies.append({
                    "description": task_description,
                    "limit": max_results,
                })

            all_skills: list[dict[str, Any]] = []
            for request_body in request_bodies:
                resp = await client.post(
                    f"{nodejs_url}/api/internal/tools/skill-discovery",
                    json=request_body,
                    headers={"X-Internal-Token": internal_token},
                )
                if resp.status_code != 200:
                    logger.warning(
                        "skill_discovery_endpoint_error",
                        status=resp.status_code,
                        node=node_name,
                        category=request_body.get("category"),
                    )
                    await context.set(f"{node_name}_discovered", [])
                    return f"Skill discovery failed: HTTP {resp.status_code}"

                data = resp.json()
                all_skills.extend(data.get("skills", []))
    except Exception as exc:
        logger.error("skill_discovery_request_failed", error=str(exc)[:200], node=node_name)
        await context.set(f"{node_name}_discovered", [])
        return f"Skill discovery error: {str(exc)[:100]}"

    # Filter by confidence threshold
    filtered = [
        s for s in _dedupe_skills(all_skills)
        if float(s.get("confidence", 0)) >= confidence_threshold
    ]
    filtered.sort(key=lambda skill: float(skill.get("confidence", 0)), reverse=True)
    filtered = filtered[:max_results]

    # Store in context
    await context.set(f"{node_name}_discovered", filtered)

    # Also store no_match flag for downstream conditional_branch nodes
    if not filtered:
        await context.set(f"{node_name}_no_match", True)
        return "Discovered 0 skills matching the task (no_match)"

    await context.set(f"{node_name}_no_match", False)

    # Build summary
    skill_summaries = ", ".join(
        f"{s.get('name', s.get('id', '?'))} ({s.get('confidence', 0):.2f})"
        for s in filtered[:5]
    )
    return f"Discovered {len(filtered)} skills: {skill_summaries}"


async def _resolve_task(
    task_source: str,
    node_config: dict[str, Any],
    context: AgencyRunContext,
    results: dict[str, Any],
) -> str:
    """Resolve task description from the configured source."""
    if task_source == "static":
        return node_config.get("taskValue", "")

    if task_source == "context":
        context_key = node_config.get("contextKey", "")
        val = await context.get(context_key)
        return str(val) if val else ""

    if task_source == "previous_output":
        # Use the last result in the results dict
        if results:
            last_key = list(results.keys())[-1]
            val = results[last_key]
            return str(val) if val else ""
        return ""

    return ""
