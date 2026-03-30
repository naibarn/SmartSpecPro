"""Agency Workflow Advisor — Post-run analysis that suggests flow improvements.

After an agency run completes, analyzes the execution trace and results
to generate improvement suggestions. Stores suggestions as agency-wide
memories with type 'workflow_suggestion' for retrieval in future runs.

This enables agencies to evolve their own workflow over time.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.services.agentic_sanitizer import sanitize_llm_input

logger = logging.getLogger(__name__)


async def generate_workflow_suggestions(
    gateway_client: Any,
    model_name: str,
    agency_name: str,
    nodes: list[dict],
    node_results: dict[str, str],
    run_status: str,
    total_duration_ms: int = 0,
    total_tokens: int = 0,
) -> list[dict]:
    """Analyze a completed agency run and suggest workflow improvements.

    Returns list of suggestion dicts with 'content' and 'memory_type'.
    """
    if not node_results or len(node_results) < 2:
        return []  # Need at least 2 nodes for workflow analysis

    # Build a concise summary of the run for LLM analysis
    node_summary = []
    for node in nodes:
        node_id = node.get("id", "")
        node_name = node.get("name", node_id)
        node_type = node.get("nodeType", "agent")
        result = node_results.get(node_id, "")
        result_preview = sanitize_llm_input(result, max_length=300) if result else "(no output)"
        node_summary.append(f"- {node_name} ({node_type}): {result_preview}")

    run_summary = "\n".join(node_summary)

    prompt_messages = [
        {
            "role": "system",
            "content": (
                "You are a workflow optimization advisor. Analyze this multi-agent workflow execution "
                "and suggest concrete improvements.\n\n"
                "Return a JSON array of suggestions. Each suggestion:\n"
                '{"category": "...", "suggestion": "...", "priority": "high|medium|low"}\n\n'
                "Categories:\n"
                "- 'node_order': Suggest reordering nodes for better flow\n"
                "- 'node_instructions': Suggest improving a specific node's instructions\n"
                "- 'missing_node': Suggest adding a new node for a gap in the workflow\n"
                "- 'redundant_node': Suggest removing/merging nodes that overlap\n"
                "- 'model_selection': Suggest different models for specific nodes\n"
                "- 'output_quality': Suggest how to improve output quality\n"
                "- 'efficiency': Suggest ways to reduce cost/time\n\n"
                "Be specific and actionable. Maximum 5 suggestions."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Agency: {sanitize_llm_input(agency_name, max_length=200)}\n"
                f"Run status: {run_status}\n"
                f"Duration: {total_duration_ms}ms, Tokens: {total_tokens}\n\n"
                f"Node execution results:\n{run_summary}"
            ),
        },
    ]

    try:
        import asyncio
        response = await asyncio.wait_for(
            gateway_client.chat.completions.create(
                model=model_name,
                messages=prompt_messages,
                max_tokens=1000,
                response_format={"type": "json_object"},
            ),
            timeout=60.0,
        )

        content = response.choices[0].message.content or "[]"
        # Handle both {"suggestions": [...]} and direct [...] format
        data = json.loads(content)
        if isinstance(data, dict):
            suggestions_raw = data.get("suggestions", data.get("items", []))
        elif isinstance(data, list):
            suggestions_raw = data
        else:
            return []

        # Convert to memory format
        memories: list[dict] = []
        for s in suggestions_raw[:5]:
            if not isinstance(s, dict):
                continue
            suggestion_text = s.get("suggestion", "")
            category = s.get("category", "output_quality")
            priority = s.get("priority", "medium")
            if suggestion_text:
                memories.append({
                    "content": f"[{category}] {suggestion_text} (priority: {priority})",
                    "memory_type": "process",
                })

        return memories

    except Exception as exc:
        logger.debug("workflow_suggestion_failed", error=str(exc)[:120])
        return []


async def store_workflow_suggestions(
    suggestions: list[dict],
    tenant_id: str,
    agency_id: str,
    user_id: int,
) -> int:
    """Store workflow improvement suggestions as agency-wide memories."""
    if not suggestions:
        return 0

    from app.core.database import AsyncSessionLocal
    from app.services.long_term_memory import LongTermMemoryService

    stored = 0
    async with AsyncSessionLocal() as session:
        service = LongTermMemoryService(db_session=session)
        for suggestion in suggestions:
            try:
                saved = await service.save_memory(
                    tenant_id=tenant_id,
                    agency_id=agency_id,
                    agent_node_id="__workflow_advisor__",
                    user_id=user_id,
                    content=suggestion["content"],
                    memory_type=suggestion["memory_type"],
                    source_run_id="workflow_advisor",
                    confidence=0.6,  # Lower confidence — suggestions need validation
                )
                if saved:
                    stored += 1
            except Exception:
                pass

    if stored:
        logger.info("workflow_suggestions_stored", agency_id=agency_id, count=stored)
    return stored
