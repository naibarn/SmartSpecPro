from __future__ import annotations

import os
import json
import asyncio
import yaml
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.config import settings
from app.kilo.job_manager import JOB_MANAGER
from app.kilo.context_manager import CONTEXT_MANAGER, ContextSettings
from app.orchestrator.sandbox import validate_workspace
from app.core.legacy_key import reject_legacy_key_http


router = APIRouter(prefix="/api/v1/kilo", tags=["kilo"])

WORKSPACE_ROOT = os.getenv("WORKSPACE_ROOT", "")


class ConversationMessage(BaseModel):
    """A single message in conversation history"""
    role: str  # "user" | "assistant"
    content: str
    timestamp: Optional[float] = None


class ConversationContext(BaseModel):
    """Context sent from frontend"""
    session_id: Optional[str] = None
    recent_messages: Optional[List[ConversationMessage]] = None
    summary: Optional[str] = None


class RunReq(BaseModel):
    """Request body for /run endpoint"""
    workspace: str
    command: str
    session_id: Optional[str] = None
    conversation_context: Optional[ConversationContext] = None


def _require_localhost(req: Request):
    if getattr(settings, "SMARTSPEC_LOCALHOST_ONLY", False):
        host = (req.client.host if req.client else "") or ""
        if host not in ("127.0.0.1", "::1", "localhost"):
            raise HTTPException(status_code=403, detail="Forbidden (localhost only)")


def _require_proxy_token(req: Request):
    if not settings.DEBUG and not settings.SMARTSPEC_PROXY_TOKEN:
        raise HTTPException(status_code=500, detail="SMARTSPEC_PROXY_TOKEN is required in production")

    if not settings.SMARTSPEC_PROXY_TOKEN:
        return

    h = (req.headers.get("authorization") or "").strip()
    token = ""
    if h.lower().startswith("bearer "):
        token = h.split(" ", 1)[1].strip()
    if not token:
        token = (req.headers.get("x-proxy-token") or "").strip()

    if token != settings.SMARTSPEC_PROXY_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/run")
async def run(req: Request, body: RunReq):
    """
    Run a Kilo CLI command with optional conversation context.
    
    The context system maintains conversation history across multiple commands
    within the same session, allowing the LLM to reference previous interactions.
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)

    validate_workspace(WORKSPACE_ROOT, body.workspace)
    
    # Prepare context
    session_id = body.session_id
    context_data = None
    
    if body.conversation_context or session_id:
        # Use context manager to prepare context
        prepared = CONTEXT_MANAGER.prepare_context(
            session_id=session_id or (body.conversation_context.session_id if body.conversation_context else None),
            new_command=body.command,
            conversation_context=body.conversation_context.model_dump() if body.conversation_context else None
        )
        session_id = prepared.session_id
        context_data = {
            "messages": prepared.messages,
            "total_tokens": prepared.total_tokens,
            "was_truncated": prepared.was_truncated,
            "context_usage_percent": prepared.context_usage_percent
        }
    
    # Start job with context
    job = JOB_MANAGER.start(
        command=body.command, 
        cwd=body.workspace,
        session_id=session_id,
        context=context_data
    )
    
    return {
        "jobId": job.job_id,
        "sessionId": session_id,
        "contextInfo": {
            "totalTokens": context_data["total_tokens"] if context_data else 0,
            "wasTruncated": context_data["was_truncated"] if context_data else False,
            "usagePercent": context_data["context_usage_percent"] if context_data else 0
        } if context_data else None
    }


@router.get("/jobs/{job_id}/events")
async def job_events(req: Request, job_id: str):
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)

    async def gen():
        seq = 0
        while True:
            job = JOB_MANAGER.get(job_id)
            if not job:
                yield json.dumps({"type": "error", "message": "job_not_found"}) + "\n"
                return

            rows = JOB_MANAGER.pop_output(job_id, timeout=0.2)
            for s, line in rows:
                seq = max(seq, s)
                yield json.dumps({"type": "stdout", "seq": s, "data": line}) + "\n"

            if job.status != "running":
                yield json.dumps({"type": "status", "status": job.status, "returncode": job.returncode, "seq": seq}) + "\n"
                return

            await asyncio.sleep(0.05)

    return StreamingResponse(gen(), media_type="text/plain")


@router.post("/jobs/{job_id}/response")
async def job_response(req: Request, job_id: str, body: Dict[str, Any]):
    """
    Record assistant response for context tracking.
    Called after job completes to store the response in conversation history.
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)
    
    job = JOB_MANAGER.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_not_found")
    
    response_content = body.get("response", "")
    if response_content and job.session_id:
        CONTEXT_MANAGER.add_assistant_response(job.session_id, response_content)
    
    return {"ok": True}


@router.get("/sessions/{session_id}/context")
async def get_session_context(req: Request, session_id: str):
    """
    Get context usage information for a session.
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)
    
    usage = CONTEXT_MANAGER.get_context_usage(session_id)
    if "error" in usage:
        raise HTTPException(status_code=404, detail=usage["error"])
    
    return usage


class WorkflowArg(BaseModel):
    name: str
    type: str = "string"
    values: list[str] | None = None
    required: bool = False


class WorkflowSchema(BaseModel):
    name: str
    description: str | None = None
    example: str | None = None
    args: list[WorkflowArg] | None = None


@router.get("/workflows")
async def list_workflows(req: Request, workspace: str | None = None):
    """
    List available Kilo workflows.

    - Looks for YAML files in "<workspace>/.smartspec/workflows"
    - Returns simple list of workflow names
    - Optionally returns schema information parsed from each YAML file
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)

    root = Path(WORKSPACE_ROOT or os.getcwd())

    # If the caller passes an explicit workspace, validate and use it.
    if workspace:
        validated = validate_workspace(workspace, WORKSPACE_ROOT or "")
        root = Path(validated)

    wf_dir = root / ".smartspec" / "workflows"
    names: list[str] = []
    schemas: list[dict] = []

    if wf_dir.exists() and wf_dir.is_dir():
        for p in sorted(wf_dir.glob("*.yaml")) + sorted(wf_dir.glob("*.yml")):
            try:
                raw = yaml.safe_load(p.read_text(encoding="utf-8"))
            except Exception:
                raw = None

            schema_name = p.stem
            if isinstance(raw, dict) and raw.get("name"):
                schema_name = str(raw["name"])

            if schema_name not in names:
                names.append(schema_name)

            if isinstance(raw, dict) and raw.get("name"):
                try:
                    schema = WorkflowSchema(**raw)
                    schemas.append(schema.model_dump())
                except Exception:
                    # Ignore invalid schema definitions but still expose the workflow name.
                    pass

    return {"workflows": sorted(names), "schemas": schemas}


class StdinRequest(BaseModel):
    text: str


@router.post("/jobs/{job_id}/input")
async def job_input(req: Request, job_id: str, body: StdinRequest):
    """
    Send a single line of stdin text to a running job.
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)

    ok = JOB_MANAGER.send_input(job_id, body.text)
    if not ok:
        raise HTTPException(status_code=404, detail="job_not_found_or_not_running")
    return {"ok": True}


@router.post("/jobs/{job_id}/cancel")
async def job_cancel(req: Request, job_id: str):
    """
    Request cancellation of a running job.
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)

    ok = JOB_MANAGER.cancel(job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="job_not_found_or_not_running")
    return {"ok": True}


# ==================== Long-term Memory API ====================

from app.kilo.memory_store import (
    get_memory_store, MemoryStore, Memory, MemoryType
)
from app.kilo.memory_extractor import get_memory_extractor, MemoryExtractor


class MemoryRequest(BaseModel):
    """Request body for saving a memory"""
    project_id: str
    type: str  # decision, plan, architecture, component, task, code_knowledge
    title: str
    content: str
    metadata: Optional[Dict[str, Any]] = None
    importance: int = 5
    tags: Optional[List[str]] = None
    source: Optional[str] = None


class MemorySearchRequest(BaseModel):
    """Request body for searching memories"""
    project_id: str
    query: str
    types: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    min_importance: Optional[int] = None
    limit: int = 20


class ExtractMemoriesRequest(BaseModel):
    """Request body for extracting memories from conversation"""
    project_id: str
    conversation: List[ConversationMessage]
    source: Optional[str] = None


class RelevantMemoriesRequest(BaseModel):
    """Request body for getting relevant memories"""
    project_id: str
    query: str
    types: Optional[List[str]] = None
    limit: int = 10


@router.post("/memory/save")
async def save_memory(req: Request, body: MemoryRequest):
    """
    Save a memory to the long-term memory store.
    
    Memories are project-scoped and shared across all sessions/tabs
    working on the same project.
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)
    
    store = get_memory_store()
    
    try:
        memory_type = MemoryType(body.type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid memory type: {body.type}")
    
    memory = store.save_memory(
        project_id=body.project_id,
        type=memory_type,
        title=body.title,
        content=body.content,
        metadata=body.metadata,
        importance=body.importance,
        tags=body.tags,
        source=body.source
    )
    
    # Generate embedding for semantic search
    extractor = get_memory_extractor()
    extractor._save_embedding(memory)
    
    return {"memory": memory.to_dict()}


@router.get("/memory/{memory_id}")
async def get_memory(req: Request, memory_id: str):
    """Get a memory by ID"""
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)
    
    store = get_memory_store()
    memory = store.get_memory(memory_id)
    
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    
    return {"memory": memory.to_dict()}


@router.delete("/memory/{memory_id}")
async def delete_memory(req: Request, memory_id: str, soft: bool = True):
    """Delete a memory (soft delete by default)"""
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)
    
    store = get_memory_store()
    store.delete_memory(memory_id, soft_delete=soft)
    
    return {"ok": True}


@router.post("/memory/search")
async def search_memories(req: Request, body: MemorySearchRequest):
    """
    Search memories using full-text search.
    
    Supports filtering by type, tags, and importance.
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)
    
    store = get_memory_store()
    
    types = None
    if body.types:
        try:
            types = [MemoryType(t) for t in body.types]
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    
    memories = store.search_memories(
        project_id=body.project_id,
        query=body.query,
        types=types,
        tags=body.tags,
        min_importance=body.min_importance,
        limit=body.limit
    )
    
    return {"memories": [m.to_dict() for m in memories]}


@router.post("/memory/extract")
async def extract_memories(req: Request, body: ExtractMemoriesRequest):
    """
    Extract memories from a conversation using LLM.
    
    Automatically identifies decisions, plans, components, tasks,
    and code knowledge from the conversation.
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)
    
    extractor = get_memory_extractor()
    
    # Convert to dict format
    conversation = [
        {"role": msg.role, "content": msg.content}
        for msg in body.conversation
    ]
    
    memories = extractor.extract_memories(
        conversation=conversation,
        project_id=body.project_id,
        source=body.source
    )
    
    return {"memories": [m.to_dict() for m in memories]}


@router.post("/memory/relevant")
async def get_relevant_memories(req: Request, body: RelevantMemoriesRequest):
    """
    Get memories relevant to a query using hybrid search.
    
    Combines semantic search, full-text search, and importance-based
    retrieval to find the most relevant memories.
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)
    
    extractor = get_memory_extractor()
    
    types = None
    if body.types:
        try:
            types = [MemoryType(t) for t in body.types]
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    
    memories = extractor.get_relevant_memories(
        query=body.query,
        project_id=body.project_id,
        limit=body.limit,
        include_types=types
    )
    
    # Format for context
    context = extractor.format_memories_for_context(memories)
    
    return {
        "memories": [m.to_dict() for m in memories],
        "context": context
    }


@router.get("/project/{project_id}/memories")
async def get_project_memories(
    req: Request, 
    project_id: str,
    type: Optional[str] = None,
    limit: int = 100
):
    """Get all memories for a project"""
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)
    
    store = get_memory_store()
    
    memory_type = None
    if type:
        try:
            memory_type = MemoryType(type)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid memory type: {type}")
    
    memories = store.get_project_memories(
        project_id=project_id,
        type=memory_type,
        limit=limit
    )
    
    return {"memories": [m.to_dict() for m in memories]}


@router.get("/project/{project_id}/stats")
async def get_project_memory_stats(req: Request, project_id: str):
    """Get memory statistics for a project"""
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)
    
    store = get_memory_store()
    stats = store.get_memory_stats(project_id)
    
    return stats


class ProjectRequest(BaseModel):
    """Request body for creating/getting a project"""
    name: str
    workspace_path: Optional[str] = None


@router.post("/project")
async def create_or_get_project(req: Request, body: ProjectRequest):
    """
    Create a new project or get existing one by name/path.
    
    Projects are used to scope memories - all sessions working on
    the same project share the same long-term memory.
    """
    reject_legacy_key_http(req)
    _require_localhost(req)
    _require_proxy_token(req)
    
    store = get_memory_store()
    project_id = store.get_or_create_project(
        name=body.name,
        workspace_path=body.workspace_path
    )
    
    project = store.get_project(project_id)
    
    return {"project": project}
