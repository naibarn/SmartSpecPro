"""Agency Improvement Advisor — LLM-powered analysis of user feedback + periodic health checks.

Core intelligence service for the Continuous Improvement Loop:
1. Analyze user feedback against agency objective → generate suggestions
2. Auto-enrich node instructions from learnings (safe, non-structural)
3. Periodic health monitor → check model freshness + performance trends
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.agentic_sanitizer import sanitize_llm_input

logger: Any = logging.getLogger(__name__)


# ── 1. Feedback Analyzer ─────────────────────────────────────────


async def analyze_feedback(
    db: AsyncSession,
    gateway_client: Any,
    model_name: str,
    feedback_id: int,
    agency_id: str,
    tenant_id: str,
) -> dict | None:
    """Analyze user feedback against agency objective and generate improvement suggestions.

    Reads: agency objective, feedback details, past improvements, recent memories.
    Writes: advisorAnalysis JSON back to the feedback row.
    """
    # Gather context
    agency_row = await db.execute(
        text('SELECT name, objective, "sharedInstructions" FROM agencies WHERE id = :id AND "tenantId" = :tid'),
        {"id": agency_id, "tid": tenant_id},
    )
    agency = agency_row.fetchone()
    if not agency:
        return None

    agency_name = agency[0] or "Unknown"
    objective = agency[1] or "No objective defined"
    shared_instructions = agency[2] or ""

    # Read the feedback (scoped by agency + tenant)
    fb_row = await db.execute(
        text(
            'SELECT rating, "whatWorked", "whatDidntWork", "improvementRequests" '
            'FROM agency_run_feedback WHERE id = :id AND "agencyId" = :aid AND "tenantId" = :tid'
        ),
        {"id": feedback_id, "aid": agency_id, "tid": tenant_id},
    )
    fb = fb_row.fetchone()
    if fb is None:
        return None

    rating, what_worked, what_didnt, improvements = fb[0], fb[1], fb[2], fb[3]

    # Read past improvements for context
    hist_row = await db.execute(
        text(
            'SELECT description, "changeType" FROM agency_improvement_history '
            'WHERE "agencyId" = :aid ORDER BY "createdAt" DESC LIMIT 5'
        ),
        {"aid": agency_id},
    )
    past_improvements = [{"description": r[0], "type": r[1]} for r in hist_row.fetchall()]

    # Read agent nodes
    nodes_row = await db.execute(
        text(
            'SELECT id, name, instructions, model FROM agency_agents '
            'WHERE "agencyId" = :aid ORDER BY "isEntryPoint" DESC'
        ),
        {"aid": agency_id},
    )
    agents = [{"id": r[0], "name": r[1], "instructions": (r[2] or "")[:200], "model": r[3]} for r in nodes_row.fetchall()]

    # Build LLM prompt
    import asyncio
    messages = [
        {
            "role": "system",
            "content": (
                "You are an Agency Improvement Advisor. Analyze the user's feedback about an AI agency run "
                "and generate specific, actionable improvement suggestions.\n\n"
                "Return JSON: {\n"
                '  "suggestions": [{"category": "...", "suggestion": "...", "priority": "high|medium|low", '
                '"autoApplyable": bool, "targetNodeId": "..." or null}],\n'
                '  "objectiveAlignment": 0.0-1.0,\n'
                '  "overallAssessment": "brief assessment"\n'
                "}\n\n"
                "Categories: node_instructions, model_selection, add_node, remove_node, "
                "reorder_nodes, shared_instructions, objective_refinement, output_quality\n\n"
                "autoApplyable=true ONLY for node_instructions changes (safe to auto-apply).\n"
                "All structural changes (add/remove/reorder nodes, model changes) must be autoApplyable=false."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Agency: {sanitize_llm_input(agency_name, max_length=200)}\n"
                f"Objective: {sanitize_llm_input(objective, max_length=500)}\n\n"
                f"User Rating: {rating}/5\n"
                f"What Worked: {sanitize_llm_input(what_worked or 'Not specified', max_length=500)}\n"
                f"What Didn't Work: {sanitize_llm_input(what_didnt or 'Not specified', max_length=500)}\n"
                f"Improvement Requests: {sanitize_llm_input(improvements or 'None', max_length=500)}\n\n"
                f"Agent Nodes:\n" + "\n".join(
                    f"- {a['name']} (model: {a['model']}): {a['instructions']}" for a in agents
                ) + "\n\n"
                f"Past Improvements:\n" + (
                    "\n".join(f"- [{p['type']}] {p['description']}" for p in past_improvements)
                    if past_improvements else "None yet"
                )
            ),
        },
    ]

    try:
        response = await asyncio.wait_for(
            gateway_client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=1500,
                response_format={"type": "json_object"},
            ),
            timeout=60.0,
        )
        content = response.choices[0].message.content or "{}"
        analysis = json.loads(content)

        # Validate and normalize — enforce autoApplyable server-side
        # Only node_instructions changes are safe to auto-apply; LLM cannot override this
        suggestions = analysis.get("suggestions", [])[:8]
        SAFE_AUTO_CATEGORIES = {"node_instructions"}
        for s in suggestions:
            s["autoApplyable"] = bool(s.get("category") in SAFE_AUTO_CATEGORIES and s.get("targetNodeId"))
            s.setdefault("priority", "medium")
            s.setdefault("targetNodeId", None)

        advisor_data = {
            "suggestions": suggestions,
            "objectiveAlignment": float(analysis.get("objectiveAlignment", 0.5)),
            "analyzedAt": datetime.now(timezone.utc).isoformat(),
        }

        # Save back to feedback row
        await db.execute(
            text(
                'UPDATE agency_run_feedback SET "advisorAnalysis" = :analysis::jsonb '
                'WHERE id = :id'
            ),
            {"analysis": json.dumps(advisor_data), "id": feedback_id},
        )
        await db.commit()

        # Auto-apply safe changes
        auto_applied = 0
        for s in suggestions:
            if s.get("autoApplyable") and s.get("targetNodeId") and s.get("category") == "node_instructions":
                applied = await _auto_enrich_instructions(
                    db, agency_id, tenant_id, s["targetNodeId"], s["suggestion"], feedback_id,
                )
                if applied:
                    auto_applied += 1

        logger.info(
            "feedback_analysis_complete",
            feedback_id=feedback_id,
            suggestions=len(suggestions),
            auto_applied=auto_applied,
            objective_alignment=advisor_data["objectiveAlignment"],
        )

        return advisor_data

    except Exception as exc:
        logger.warning("feedback_analysis_failed", error=str(exc)[:120])
        return None


# ── 2. Auto-Enrich Instructions ──────────────────────────────────


async def _auto_enrich_instructions(
    db: AsyncSession,
    agency_id: str,
    tenant_id: str,
    node_id: str,
    suggestion: str,
    feedback_id: int,
) -> bool:
    """Append a learning to an agent node's instructions (non-destructive)."""
    try:
        result = await db.execute(
            text(
                'SELECT aa.instructions FROM agency_agents aa '
                'JOIN agencies a ON a.id = aa."agencyId" '
                'WHERE aa.id = :nid AND aa."agencyId" = :aid AND a."tenantId" = :tid'
            ),
            {"nid": node_id, "aid": agency_id, "tid": tenant_id},
        )
        row = result.fetchone()
        if row is None:
            return False

        current = str(row[0] or "")
        enrichment = f"\n\n[Auto-learned from user feedback]: {sanitize_llm_input(suggestion, max_length=500)}"

        # Don't duplicate
        if suggestion[:50] in current:
            return False

        # Cap total instruction length
        if len(current) + len(enrichment) > 10000:
            return False

        await db.execute(
            text(
                'UPDATE agency_agents SET instructions = :instr '
                'FROM agencies a '
                'WHERE agency_agents.id = :nid AND agency_agents."agencyId" = :aid '
                'AND a.id = agency_agents."agencyId" AND a."tenantId" = :tid'
            ),
            {"instr": current + enrichment, "nid": node_id, "aid": agency_id, "tid": tenant_id},
        )

        # Log improvement history
        await db.execute(
            text(
                'INSERT INTO agency_improvement_history '
                '("tenantId", "agencyId", "triggerType", "triggerRef", "changeType", '
                '"agentNodeId", description, "previousValue", "newValue") '
                'VALUES (:tid, :aid, :trigger, :ref, :change, :nid, :desc, :prev, :new)'
            ),
            {
                "tid": tenant_id, "aid": agency_id,
                "trigger": "auto_enrich", "ref": f"feedback:{feedback_id}",
                "change": "node_instructions", "nid": node_id,
                "desc": f"Auto-enriched instructions: {suggestion[:200]}",
                "prev": current[-200:] if len(current) > 200 else current,
                "new": enrichment,
            },
        )
        await db.commit()
        return True
    except Exception as exc:
        logger.debug("auto_enrich_failed", error=str(exc)[:120])
        return False


# ── 3. Agency Health Monitor ─────────────────────────────────────


async def check_agency_health(
    db: AsyncSession,
    gateway_client: Any,
    model_name: str,
    agency_id: str,
    tenant_id: str,
) -> dict | None:
    """Periodic health check for an agency — analyzes performance trends + model freshness.

    Returns analysis dict with suggestions, or None if agency is healthy.
    """
    # Get agency info
    agency_row = await db.execute(
        text('SELECT name, objective, "defaultModel" FROM agencies WHERE id = :id AND "tenantId" = :tid'),
        {"id": agency_id, "tid": tenant_id},
    )
    agency = agency_row.fetchone()
    if agency is None:
        return None

    agency_name, objective, default_model = agency[0], agency[1] or "", agency[2] or ""

    # Get recent feedback stats
    stats_row = await db.execute(
        text(
            'SELECT count(*), avg(rating), min(rating) '
            'FROM agency_run_feedback '
            'WHERE "agencyId" = :aid AND "createdAt" > NOW() - INTERVAL \'30 days\''
        ),
        {"aid": agency_id},
    )
    stats = stats_row.fetchone()
    if stats is None:
        return None
    run_count = stats[0] or 0
    avg_rating = float(stats[1] or 0)
    min_rating = stats[2] or 0

    # Get agent nodes + models
    nodes_row = await db.execute(
        text(
            'SELECT id, name, model, "modelRequirements" '
            'FROM agency_agents WHERE "agencyId" = :aid'
        ),
        {"aid": agency_id},
    )
    agents = [{"id": r[0], "name": r[1], "model": r[2], "smartMode": r[3] is not None} for r in nodes_row.fetchall()]

    # Get available models for freshness check
    models_row = await db.execute(
        text("SELECT id, name FROM llm_models WHERE enabled = true ORDER BY priority ASC LIMIT 20"),
    )
    available_models = [{"id": r[0], "name": r[1]} for r in models_row.fetchall()]

    import asyncio
    messages = [
        {
            "role": "system",
            "content": (
                "You are an Agency Health Monitor. Analyze this agency's health and suggest improvements.\n\n"
                "Return JSON: {\n"
                '  "healthScore": 0.0-1.0,\n'
                '  "issues": [{"issue": "...", "severity": "high|medium|low", "recommendation": "..."}],\n'
                '  "modelRecommendations": [{"nodeId": "...", "currentModel": "...", "suggestedModel": "...", "reason": "..."}]\n'
                "}\n\n"
                "Check for:\n"
                "1. Low user satisfaction (avg rating < 3.5)\n"
                "2. Outdated models (older models when newer are available)\n"
                "3. Nodes not using Smart/Auto model selection\n"
                "4. Missing objective definition\n"
                "5. Agents with empty or generic instructions"
            ),
        },
        {
            "role": "user",
            "content": (
                f"Agency: {sanitize_llm_input(agency_name, max_length=200)}\n"
                f"Objective: {sanitize_llm_input(objective or 'NOT SET', max_length=300)}\n"
                f"Stats (30 days): {run_count} runs, avg rating: {avg_rating:.1f}/5, lowest: {min_rating}/5\n\n"
                f"Agent Nodes:\n" + "\n".join(
                    f"- {a['name']} (model: {a['model']}, auto: {a['smartMode']})" for a in agents
                ) + f"\n\nAvailable Models:\n" + "\n".join(
                    f"- {m['id']}" for m in available_models[:10]
                )
            ),
        },
    ]

    try:
        response = await asyncio.wait_for(
            gateway_client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=1000,
                response_format={"type": "json_object"},
            ),
            timeout=60.0,
        )
        content = response.choices[0].message.content or "{}"
        return json.loads(content)
    except Exception as exc:
        logger.debug("health_check_failed", agency_id=agency_id, error=str(exc)[:120])
        return None
