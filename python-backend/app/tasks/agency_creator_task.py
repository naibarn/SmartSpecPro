"""
Celery tasks for the AI Agency Creator (Phase F).

Split into 2 tasks per Fix I5 — Celery cannot block-wait for user answers:
  - create_agency_discover_task  (phases 1-2: DISCOVER + INTERVIEW)
  - create_agency_design_task    (phases 3-7: DESIGN → DOCUMENT)

Both tasks are sync Celery tasks wrapping async code via _run_async(),
following the same pattern as workflow_gen_tasks.py.

Status is stored in Redis under keys:
  agency-creator:{task_id}       → task status dict
  agency-creator:{task_id}:ans   → interview answers (written by autoCreateAnswer)
"""

import asyncio
import json
import os
import re
import uuid
from typing import Any

import redis as sync_redis
import structlog

from app.core.celery_app import celery_app

logger = structlog.get_logger(__name__)

REDIS_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
RESULT_TTL = 7200  # 2 hours

_redis_pool = sync_redis.ConnectionPool.from_url(REDIS_URL, decode_responses=True)


def _get_redis() -> sync_redis.Redis:
    return sync_redis.Redis(connection_pool=_redis_pool)


def _run_async(coro) -> Any:
    """Run async coroutine in Celery worker — fresh loop per invocation."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _set_status(task_id: str, status: dict) -> None:
    try:
        r = _get_redis()
        r.set(f"agency-creator:{task_id}", json.dumps(status, default=str), ex=RESULT_TTL)
    except Exception as exc:
        logger.error("agency_creator_redis_set_failed", task_id=task_id, error=str(exc)[:200])


def get_status(task_id: str, user_id: int | None = None) -> dict | None:
    """Read agency creator task status from Redis.

    Enforces ownership check if user_id provided.
    """
    r = _get_redis()
    raw = r.get(f"agency-creator:{task_id}")
    if raw is None:
        return None
    data = json.loads(raw)
    if user_id is not None and data.get("_user_id") is not None:
        if data["_user_id"] != user_id:
            return None
    return data


def store_answers(task_id: str, answers: dict[str, str]) -> None:
    """Store interview answers in Redis so design task can read them."""
    r = _get_redis()
    r.set(f"agency-creator:{task_id}:ans", json.dumps(answers), ex=RESULT_TTL)


def get_answers(task_id: str) -> dict[str, str]:
    r = _get_redis()
    raw = r.get(f"agency-creator:{task_id}:ans")
    return json.loads(raw) if raw else {}


def create_task_id() -> str:
    return f"agcreate-{uuid.uuid4().hex[:12]}"


# ─── Task 1: DISCOVER + INTERVIEW ────────────────────────────────────────────

@celery_app.task(
    bind=True,
    max_retries=0,
    name="app.tasks.agency_creator_task.create_agency_discover_task",
    soft_time_limit=300,
    time_limit=360,
)
def create_agency_discover_task(
    self,
    task_id: str,
    user_jwt: str,
    user_id: int,
    payload: dict,
):
    """Phase 1-2: DISCOVER + INTERVIEW.

    Analyses the requirement and decides whether to ask follow-up questions.
    If skipInterview=True or requirement is self-contained → dispatches design task immediately.
    Otherwise returns with status='awaiting_answers' + questions for the frontend to render.
    """
    logger.info("agency_creator_discover_started", task_id=task_id)
    _set_status(task_id, {
        "status": "processing",
        "phase": "discover",
        "message": "Analysing your requirement...",
        "_user_id": user_id,
    })

    try:
        result = _run_async(_discover_async(task_id, user_jwt, user_id, payload))
        return result
    except Exception as exc:
        logger.error("agency_creator_discover_failed", task_id=task_id, error=str(exc)[:300])
        _set_status(task_id, {
            "status": "failed",
            "error": str(exc)[:500],
            "_user_id": user_id,
        })
        return {"status": "failed"}


async def _discover_async(task_id: str, user_jwt: str, user_id: int, payload: dict) -> dict:
    """Async implementation of DISCOVER + INTERVIEW phases."""
    requirement: str = payload.get("requirement", "")
    skip_interview: bool = payload.get("skipInterview", False)
    model: str = payload.get("model", "gpt-4o")

    # Phase 1: DISCOVER — parse intent via LLM
    _set_status(task_id, {
        "status": "processing",
        "phase": "discover",
        "message": "Understanding your requirement...",
        "_user_id": user_id,
    })

    intent = await _llm_discover(requirement, model, user_jwt)

    # Phase 2: INTERVIEW — decide if we need more info
    if skip_interview or intent.get("is_clear", True):
        # Immediately dispatch design task
        _set_status(task_id, {
            "status": "processing",
            "phase": "design",
            "message": "Designing agency architecture...",
            "_user_id": user_id,
        })
        create_agency_design_task.delay(
            task_id=task_id,
            user_jwt=user_jwt,
            user_id=user_id,
            payload={**payload, "intent": intent, "answers": {}},
        )
        return {"status": "dispatched"}

    questions = intent.get("questions", [])
    if not questions:
        # No questions → go straight to design
        create_agency_design_task.delay(
            task_id=task_id,
            user_jwt=user_jwt,
            user_id=user_id,
            payload={**payload, "intent": intent, "answers": {}},
        )
        return {"status": "dispatched"}

    # Return interview questions to frontend
    _set_status(task_id, {
        "status": "awaiting_answers",
        "phase": "interview",
        "questions": questions,
        "_user_id": user_id,
        "_payload": payload,  # stored for when design task is dispatched
        "_intent": intent,
        "_model": model,
        "_user_jwt": user_jwt,
    })
    return {"status": "awaiting_answers", "questions": questions}


# ─── Task 2: DESIGN → DOCUMENT ───────────────────────────────────────────────

@celery_app.task(
    bind=True,
    max_retries=0,
    name="app.tasks.agency_creator_task.create_agency_design_task",
    soft_time_limit=540,
    time_limit=600,
)
def create_agency_design_task(
    self,
    task_id: str,
    user_jwt: str,
    user_id: int,
    payload: dict,
):
    """Phase 3-7: DESIGN → VALIDATE → IMPLEMENT → VERIFY → DOCUMENT.

    Called after interview answers are collected (or immediately if no interview needed).
    """
    logger.info("agency_creator_design_started", task_id=task_id)
    _set_status(task_id, {
        "status": "processing",
        "phase": "design",
        "message": "Designing agency architecture...",
        "_user_id": user_id,
    })

    try:
        result = _run_async(_design_async(task_id, user_jwt, user_id, payload))
        return result
    except Exception as exc:
        logger.error("agency_creator_design_failed", task_id=task_id, error=str(exc)[:300])
        _set_status(task_id, {
            "status": "failed",
            "error": str(exc)[:500],
            "_user_id": user_id,
        })
        return {"status": "failed"}


async def _design_async(task_id: str, user_jwt: str, user_id: int, payload: dict) -> dict:
    """Async implementation of DESIGN → DOCUMENT phases."""
    requirement: str = payload.get("requirement", "")
    intent: dict = payload.get("intent", {})
    answers: dict = payload.get("answers", {})
    model: str = payload.get("model", "gpt-4o")
    tenant_id: str = payload.get("tenantId", "")

    # Phase 3: DESIGN
    _set_status(task_id, {
        "status": "processing",
        "phase": "design",
        "message": "Designing agency architecture...",
        "_user_id": user_id,
    })
    spec = await _llm_design(requirement, intent, answers, model, user_jwt)

    # Phase 4: VALIDATE (self-review)
    _set_status(task_id, {
        "status": "processing",
        "phase": "validate",
        "message": "Validating architecture spec...",
        "_user_id": user_id,
    })
    spec = _validate_spec(spec)

    # Phase 5: IMPLEMENT — call Node.js internal API to create agency
    _set_status(task_id, {
        "status": "processing",
        "phase": "implement",
        "message": "Creating agency in database...",
        "_user_id": user_id,
        "previewJson": spec,
    })
    agency_id = await _implement_agency(spec, user_jwt, tenant_id)

    # Phase 6: VERIFY (basic sanity check — skip if no agency_id)
    if agency_id:
        _set_status(task_id, {
            "status": "processing",
            "phase": "verify",
            "message": "Verifying agency...",
            "_user_id": user_id,
            "agencyId": agency_id,
        })

    # Phase 7: DOCUMENT
    _set_status(task_id, {
        "status": "processing",
        "phase": "document",
        "message": "Writing usage guide...",
        "_user_id": user_id,
        "agencyId": agency_id,
    })
    guide = await _llm_document(spec, model, user_jwt)

    _set_status(task_id, {
        "status": "completed",
        "phase": "done",
        "agencyId": agency_id,
        "previewJson": spec,
        "guide": guide,
        "_user_id": user_id,
    })
    logger.info("agency_creator_completed", task_id=task_id, agency_id=agency_id)
    return {"status": "completed", "agencyId": agency_id}


# ─── LLM helpers ─────────────────────────────────────────────────────────────


def _get_web_gateway_url() -> str:
    """Return the Node.js web gateway URL for LLM calls.

    The web gateway (/v1/chat/completions) uses the working OpenRouter key
    from the llm_providers table and handles credit deduction automatically.
    """
    return (
        os.getenv("SMARTSPEC_INTERNAL_URL")
        or os.getenv("SMARTSPEC_WEB_GATEWAY_URL", "http://127.0.0.1:3000")
    )


async def _llm_call(
    system_prompt: str,
    user_message: str,
    model: str,
    user_jwt: str,
    max_tokens: int = 4000,
    timeout: float = 120.0,
) -> str | None:
    """Call LLM via the Node.js web gateway (OpenAI-compatible endpoint).

    Returns the assistant message content on success, or None on failure.
    """
    import httpx

    gateway_url = _get_web_gateway_url()
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{gateway_url}/v1/chat/completions",
                json={
                    "model": model,
                    "messages": messages,
                    "max_tokens": max_tokens,
                    "temperature": 0.7,
                },
                headers={"Authorization": f"Bearer {user_jwt}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                choices = data.get("choices", [])
                if choices:
                    return choices[0].get("message", {}).get("content", "")
            else:
                logger.warning(
                    "agency_creator_llm_call_failed",
                    status=resp.status_code,
                    body=resp.text[:300],
                )
    except Exception as exc:
        logger.warning("agency_creator_llm_call_error", error=str(exc)[:200])

    return None


async def _llm_discover(requirement: str, model: str, user_jwt: str) -> dict:
    """Phase 1: Analyse requirement and generate interview questions if needed."""

    system_prompt = """You are an AI agency architect. Analyse the user's requirement for building a multi-agent AI agency.

Return JSON with these fields:
{
  "is_clear": true/false,  // true if requirement is specific enough to design immediately
  "domain": "string",       // e.g. "content_creation", "research", "customer_support", "data_processing"
  "estimated_agents": 2,   // estimated number of agents needed
  "questions": [            // list of clarifying questions (empty if is_clear=true), max 7
    {"id": "q1", "question": "...", "type": "text"}
  ],
  "notes": "..."            // brief analysis notes
}

Only ask questions that are truly necessary to design the agency. Skip if the requirement is already clear."""

    content = await _llm_call(
        system_prompt=system_prompt,
        user_message=f"Requirement: {requirement}",
        model=model,
        user_jwt=user_jwt,
        max_tokens=1000,
        timeout=60.0,
    )
    if content:
        return _safe_json_parse(content, {"is_clear": True, "questions": []})

    # Fallback: treat as clear
    return {"is_clear": True, "domain": "general", "estimated_agents": 3, "questions": []}


async def _llm_design(requirement: str, intent: dict, answers: dict, model: str, user_jwt: str) -> dict:
    """Phase 3: Design the agency architecture as JSON spec."""
    answers_text = ""
    if answers:
        answers_text = "\n\nClarification answers:\n" + "\n".join(
            f"- {k}: {v}" for k, v in answers.items()
        )

    system_prompt = """You are an AI agency architect. Design a multi-agent agency based on the requirement.

Return JSON with this exact structure:
{
  "name": "Agency Name",
  "description": "What this agency does",
  "nodes": [
    {
      "id": "node-1",
      "nodeType": "agent",  // one of: agent, supervisor, router, aggregator, knowledge_base, skill_call, human_approval
      "name": "Agent Name",
      "description": "What this agent does",
      "instructions": "Detailed instructions for this agent",
      "model": "gpt-4o",
      "isEntryPoint": true,   // only ONE node should be entry point, must be agent or supervisor
      "toolIds": [],           // array of builtin tool IDs this agent should use (see list below)
      "nodeConfig": {}         // type-specific config
    }
  ],
  "edges": [
    {
      "fromNodeId": "node-1",
      "toNodeId": "node-2",
      "flowType": "delegation"  // delegation | handoff | parallel
    }
  ],
  "rationale": "Brief explanation of the design decisions"
}

AVAILABLE TOOLS (use these exact IDs in "toolIds"):
- "builtin-web-search"       → Search the internet for real-time information (for research, data collection, news)
- "builtin-code-interpreter"  → Execute Python code in a sandbox (for calculations, data processing)
- "builtin-file-reader"       → Read files from the workspace
- "builtin-file-writer"       → Create or modify files
- "builtin-rag-knowledge"     → Search uploaded knowledge base documents
- "builtin-http-request"      → Make HTTP requests to external REST APIs
- "builtin-email-notify"      → Send email notifications
- "builtin-webhook"           → Send data to a webhook URL
- "builtin-slack-message"     → Send messages to Slack channels
- "builtin-document-search"   → Search across document collections

TOOL ASSIGNMENT RULES:
- Assign tools that match each agent's role and responsibility
- Research/data agents → "builtin-web-search", "builtin-http-request"
- Communication agents → "builtin-email-notify", "builtin-slack-message", "builtin-webhook"
- Analysis/coding agents → "builtin-code-interpreter", "builtin-web-search"
- Document/knowledge agents → "builtin-rag-knowledge", "builtin-document-search", "builtin-file-reader"
- Content creation agents → "builtin-file-writer", "builtin-web-search"
- ALWAYS assign at least "builtin-web-search" to agents that need real-time data
- ALWAYS assign "builtin-email-notify" when the requirement mentions email/notification/alert
- Supervisors and coordinators may need tools too if they perform direct work

OTHER RULES:
- Exactly ONE entry point (agent or supervisor only)
- Router nodes need nodeConfig.routingMode + nodeConfig.routes + nodeConfig.defaultTargetNodeId
- All node IDs must be unique strings
- Model defaults to gpt-4o if not specified
- Keep it simple: 2-6 nodes is usually best"""

    user_message = f"Requirement: {requirement}{answers_text}\n\nDomain analysis: {json.dumps(intent)}"

    content = await _llm_call(
        system_prompt=system_prompt,
        user_message=user_message,
        model=model,
        user_jwt=user_jwt,
        max_tokens=4000,
        timeout=120.0,
    )
    if content:
        spec = _safe_json_parse(content, None)
        if spec and "nodes" in spec and "edges" in spec:
            return spec

    # Fallback: minimal agency
    return _fallback_agency_spec(requirement)


def _validate_spec(spec: dict) -> dict:
    """Phase 4: Self-review and fix common spec issues."""
    nodes = spec.get("nodes", [])
    edges = spec.get("edges", [])

    # Ensure exactly one entry point on an agent/supervisor
    entry_nodes = [n for n in nodes if n.get("isEntryPoint")]
    agent_supervisor_nodes = [n for n in nodes if n.get("nodeType") in ("agent", "supervisor")]

    if not entry_nodes and agent_supervisor_nodes:
        # Auto-assign first agent/supervisor as entry point
        agent_supervisor_nodes[0]["isEntryPoint"] = True
    elif len(entry_nodes) > 1:
        # Keep only first, clear rest
        for n in entry_nodes[1:]:
            n["isEntryPoint"] = False
    elif entry_nodes and entry_nodes[0].get("nodeType") not in ("agent", "supervisor"):
        # Wrong node type as entry point — fix to first agent/supervisor
        entry_nodes[0]["isEntryPoint"] = False
        if agent_supervisor_nodes:
            agent_supervisor_nodes[0]["isEntryPoint"] = True

    # Ensure all referenced node IDs exist
    node_ids = {n["id"] for n in nodes}
    spec["edges"] = [
        e for e in edges
        if e.get("fromNodeId") in node_ids and e.get("toNodeId") in node_ids
    ]

    # Ensure router nodes have required config
    for node in nodes:
        if node.get("nodeType") == "router":
            cfg = node.setdefault("nodeConfig", {})
            if not cfg.get("routingMode"):
                cfg["routingMode"] = "llm_classify"
            if not cfg.get("routes"):
                cfg["routes"] = []
            if not cfg.get("defaultTargetNodeId") and len(nodes) > 1:
                # Point to last node as default
                non_router = [n for n in nodes if n.get("nodeType") != "router"]
                if non_router:
                    cfg["defaultTargetNodeId"] = non_router[-1]["id"]

    # Validate toolIds — only allow known builtin IDs
    valid_tool_ids = {
        "builtin-web-search", "builtin-code-interpreter", "builtin-file-reader",
        "builtin-file-writer", "builtin-rag-knowledge", "builtin-skill-executor",
        "builtin-cmd-executor", "builtin-http-request", "builtin-email-notify",
        "builtin-webhook", "builtin-slack-message", "builtin-document-search",
    }
    for node in nodes:
        tool_ids = node.get("toolIds", node.get("tools", []))
        if isinstance(tool_ids, list):
            node["toolIds"] = [t for t in tool_ids if isinstance(t, str) and t in valid_tool_ids]
        else:
            node["toolIds"] = []

    spec["nodes"] = nodes
    return spec


async def _implement_agency(spec: dict, user_jwt: str, tenant_id: str = "") -> str | None:
    """Phase 5: Create agency in database via Node.js internal API."""
    import httpx

    internal_url = os.getenv("SMARTSPEC_INTERNAL_URL") or os.getenv("SMARTSPEC_WEB_GATEWAY_URL", "http://127.0.0.1:3000")

    try:
        # Prepare saveBuilder payload
        agents = []
        nodes_list = spec.get("nodes", [])
        for idx, node in enumerate(nodes_list):
            # Extract tool IDs from LLM spec (accepts both "toolIds" and legacy "tools" keys)
            tool_ids = node.get("toolIds", node.get("tools", []))
            # Ensure it's a list of strings (filter out any non-string items)
            if isinstance(tool_ids, list):
                tool_ids = [str(t) for t in tool_ids if isinstance(t, str) and t.startswith("builtin-")]
            else:
                tool_ids = []

            agents.append({
                "id": node.get("id", ""),
                "name": node.get("name", "Agent"),
                "description": node.get("description", ""),
                "instructions": node.get("instructions", ""),
                "model": node.get("model", "gpt-4o"),
                "nodeType": node.get("nodeType", "agent"),
                "nodeConfig": node.get("nodeConfig", {}),
                "isEntryPoint": node.get("isEntryPoint", False),
                "isOptional": node.get("isOptional", False),
                "position": {"x": 400, "y": 80 + idx * 200},
                "toolIds": tool_ids,
                "toolConfigs": {},
            })

        edges = []
        for edge in spec.get("edges", []):
            edges.append({
                "id": f"edge-{edge.get('fromNodeId')}-{edge.get('toNodeId')}",
                "fromAgentId": edge.get("fromNodeId", ""),
                "toAgentId": edge.get("toNodeId", ""),
                "flowType": edge.get("flowType", "delegation"),
            })

        body_json: dict = {
            "name": spec.get("name", "AI-Generated Agency"),
            "description": spec.get("description", ""),
            "agents": agents,
            "communicationFlows": edges,
        }
        if tenant_id:
            body_json["tenantId"] = tenant_id

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Create agency first
            create_resp = await client.post(
                f"{internal_url}/api/internal/agency/create",
                json=body_json,
                headers={
                    "Authorization": f"Bearer {user_jwt}",
                    "Content-Type": "application/json",
                },
            )
            if create_resp.status_code in (200, 201):
                data = create_resp.json()
                return data.get("id") or data.get("agencyId")
    except Exception as exc:
        logger.error("agency_creator_implement_failed", error=str(exc)[:200])

    return None


async def _llm_document(spec: dict, model: str, user_jwt: str) -> str:
    """Phase 7: Generate usage guide for the created agency."""
    system_prompt = "Write a concise usage guide (max 300 words) for this AI agency. Include: purpose, how to start a conversation, and 3 example prompts."
    user_message = f"Agency: {spec.get('name')}\nDescription: {spec.get('description')}\nNodes: {[n.get('name') for n in spec.get('nodes', [])]}"

    content = await _llm_call(
        system_prompt=system_prompt,
        user_message=user_message,
        model=model,
        user_jwt=user_jwt,
        max_tokens=500,
        timeout=60.0,
    )
    return content or f"Agency '{spec.get('name')}' created successfully. Start a conversation to begin using it."


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _safe_json_parse(content: str, default: Any) -> Any:
    """Parse JSON from LLM response, handling markdown code blocks."""
    # Strip markdown code blocks
    content = re.sub(r"```(?:json)?\s*", "", content).strip().rstrip("`").strip()
    try:
        return json.loads(content)
    except (json.JSONDecodeError, ValueError):
        return default


def _fallback_agency_spec(requirement: str) -> dict:
    """Minimal fallback spec when LLM call fails."""
    return {
        "name": "Custom Agency",
        "description": requirement[:200],
        "nodes": [
            {
                "id": "agent-1",
                "nodeType": "agent",
                "name": "Main Agent",
                "description": "Primary agent for this agency",
                "instructions": f"You are an AI assistant. {requirement[:500]}",
                "model": "gpt-4o",
                "isEntryPoint": True,
                "toolIds": ["builtin-web-search"],
                "nodeConfig": {},
            }
        ],
        "edges": [],
        "rationale": "Fallback single-agent design",
    }
