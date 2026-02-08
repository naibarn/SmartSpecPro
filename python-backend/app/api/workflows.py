"""Workflow API endpoints."""
import asyncio
import re
import uuid
from datetime import datetime
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.orchestrator.cost_estimator import CostEstimator
from app.orchestrator.execution_registry import get_active_execution
from app.orchestrator.flow_compiler import CompilationError, FlowCompiler
from app.orchestrator.node_registry import NodeRegistry
from app.orchestrator.ring_buffer import get_ring_buffer_store
from app.orchestrator.stream_translator import StreamTranslator

router = APIRouter()
logger = structlog.get_logger(__name__)


MAX_NODES = 500
MAX_EDGES = 1000


class FlowCompileRequest(BaseModel):
    """Request to compile ReactFlow JSON to workflow manifest."""

    nodes: list[dict[str, Any]] = Field(..., description="ReactFlow nodes", max_length=MAX_NODES)
    edges: list[dict[str, Any]] = Field(..., description="ReactFlow edges", max_length=MAX_EDGES)
    metadata: dict[str, Any] | None = Field(default=None, description="Manifest metadata")


class FlowCompileResponse(BaseModel):
    """Response from flow compilation."""

    success: bool
    manifest: dict[str, Any] | None = None
    error: str | None = None
    errors: list[str] | None = None  # Section 14: multiple validation errors
    warnings: list[str] | None = None  # Section 14: non-fatal warnings


class ExecuteWorkflowRequest(BaseModel):
    """Request to execute a compiled workflow."""

    workflowJson: dict[str, Any] = Field(..., description="Compiled workflow JSON with _compiledMetadata")


class ExecuteWorkflowResponse(BaseModel):
    """Response from workflow execution start."""

    executionId: str
    status: str
    startedAt: str


class EstimateCostRequest(BaseModel):
    """Request to estimate workflow execution cost."""

    workflowJson: dict[str, Any] = Field(..., description="Workflow JSON to estimate")


class EstimateCostResponse(BaseModel):
    """Response with cost estimation."""

    estimatedCredits: float
    breakdown: dict[str, float]
    userBalance: float
    warning: Optional[str] = None


class WorkflowReport(BaseModel):
    """Workflow execution status and results."""

    executionId: str
    status: str
    totalDurationMs: int
    nodeResults: dict[str, Any]
    startedAt: Optional[str] = None
    completedAt: Optional[str] = None
    error: Optional[str] = None


@router.post("/compile", response_model=FlowCompileResponse)
async def compile_flow(
    request: FlowCompileRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Compile ReactFlow JSON to LangGraph-compatible workflow manifest.

    This endpoint:
    1. Validates ReactFlow structure
    2. Maps ReactFlow node types to LangGraph functions
    3. Validates the compiled manifest (security checks)
    4. Returns the executable manifest
    """
    try:
        # Create flow JSON from request
        flow_json = {
            "nodes": request.nodes,
            "edges": request.edges,
        }

        # Add user metadata to manifest
        metadata = request.metadata or {}
        if "author" not in metadata:
            metadata["author"] = current_user.email or "user@smartspecpro.com"

        # Compile flow
        # TODO Section 14: Switch to WorkflowCompiler from Section 01
        # from app.orchestrator.workflow_compiler import WorkflowCompiler
        compiler = FlowCompiler()
        manifest = compiler.compile(flow_json, metadata=metadata)

        logger.info(
            "flow_compiled_successfully",
            user_id=current_user.id,
            step_count=len(manifest.get("steps", [])),
            edge_count=len(manifest["edges"]),
        )

        return FlowCompileResponse(
            success=True,
            manifest=manifest,
        )

    except CompilationError as e:
        logger.warning(
            "flow_compilation_failed",
            user_id=current_user.id,
            error=str(e),
        )
        return FlowCompileResponse(
            success=False,
            error=f"Compilation failed: {str(e)}",
        )

    except Exception as e:
        logger.exception(
            "flow_compilation_unexpected_error",
            user_id=current_user.id,
            error=str(e),
        )
        raise HTTPException(
            status_code=500,
            detail="An internal error occurred during compilation.",
        ) from e


@router.get("/")
async def list_workflows(
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List user's workflows scoped to current tenant."""
    # TODO: This will be fully implemented once the workflows table exists in the DB
    # For now, return empty list with proper structure

    logger.info(
        "list_workflows_requested",
        user_id=current_user.id,
        tenant_id=current_user.currentTenantId,
        status_filter=status,
    )

    # Once workflows table exists, query will be:
    # query = select(Workflow).where(
    #     Workflow.userId == current_user.id,
    #     Workflow.tenantId == current_user.currentTenantId
    # )
    # if status:
    #     query = query.where(Workflow.status == status)
    # result = await db.execute(query)
    # workflows = result.scalars().all()

    return {
        "workflows": [],
        "note": "Workflows table not yet populated - implementation ready for database integration"
    }


@router.post("/execute", response_model=ExecuteWorkflowResponse)
async def execute_workflow(
    request: ExecuteWorkflowRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Execute a compiled workflow.

    Validates workflow is compiled, checks credit balance, and starts execution.
    Returns execution_id for tracking status.
    """
    workflow_json = request.workflowJson

    # 1. Validate workflow is compiled
    if "_compiledMetadata" not in workflow_json:
        logger.warning(
            "workflow_not_compiled",
            user_id=current_user.id,
        )
        raise HTTPException(
            status_code=400,
            detail="Workflow has not been compiled. Please compile before executing.",
        )

    # 2. Estimate cost
    cost_estimator = CostEstimator()
    cost_result = cost_estimator.estimate(workflow_json)
    estimated_cost = cost_result["total"]

    # 3. Check user credit balance
    user_balance = getattr(current_user, "creditBalance", 100.0)  # Default for testing
    if estimated_cost > user_balance:
        logger.warning(
            "insufficient_credits_for_execution",
            user_id=current_user.id,
            required=estimated_cost,
            balance=user_balance,
        )
        raise HTTPException(
            status_code=402,  # Payment Required
            detail=f"Insufficient credits. Required: {estimated_cost:.2f}, Balance: {user_balance:.2f}",
        )

    # 4. Create execution record
    execution_id = f"exec-{uuid.uuid4().hex[:12]}"
    started_at = datetime.utcnow().isoformat() + "Z"

    # TODO: Store execution record in database once executions table exists
    # execution_record = ExecutionRecord(
    #     execution_id=execution_id,
    #     workflow_id=workflow_json.get("id"),
    #     user_id=current_user.id,
    #     tenant_id=current_user.currentTenantId,
    #     status="running",
    #     started_at=datetime.utcnow(),
    #     node_results={},
    # )
    # db.add(execution_record)
    # await db.commit()

    # 5. Start execution (will be implemented in section-09 with SSE streaming)
    # await orchestrator.execute(workflow_json, execution_id, execution_context)

    logger.info(
        "workflow_execution_started",
        execution_id=execution_id,
        user_id=current_user.id,
        estimated_cost=estimated_cost,
        node_count=len(workflow_json.get("nodes", [])),
    )

    return ExecuteWorkflowResponse(
        executionId=execution_id,
        status="running",
        startedAt=started_at,
    )


@router.post("/estimate-cost", response_model=EstimateCostResponse)
async def estimate_cost(
    request: EstimateCostRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Estimate execution cost before running workflow.

    Analyzes workflow structure and returns estimated credit cost with breakdown.
    Warns if estimated cost exceeds user balance.
    """
    workflow_json = request.workflowJson

    # Estimate cost
    cost_estimator = CostEstimator()
    cost_result = cost_estimator.estimate(workflow_json)

    estimated_credits = cost_result["total"]
    breakdown = cost_result["breakdown"]

    # Get user balance
    user_balance = getattr(current_user, "creditBalance", 100.0)  # Default for testing

    # Generate warning if needed
    warning = None
    if estimated_credits > user_balance:
        warning = f"Insufficient credits. Required: {estimated_credits:.2f}, Available: {user_balance:.2f}"
    elif estimated_credits > user_balance * 0.8:
        warning = f"Estimated cost ({estimated_credits:.2f}) exceeds 80% of your balance ({user_balance:.2f})"

    logger.info(
        "workflow_cost_estimated",
        user_id=current_user.id,
        estimated_credits=estimated_credits,
        user_balance=user_balance,
        has_warning=warning is not None,
    )

    return EstimateCostResponse(
        estimatedCredits=estimated_credits,
        breakdown=breakdown,
        userBalance=user_balance,
        warning=warning,
    )


@router.get("/execute/{execution_id}/stream")
async def stream_workflow_execution(
    execution_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    last_event_id: Optional[str] = Header(None, alias="Last-Event-ID"),
    lastEventId: Optional[str] = None,  # Query param fallback (EventSource can't send headers)
):
    """
    SSE endpoint for real-time workflow execution visualization.

    Translates LangGraph astream_events into the existing frontend SSE protocol.
    Supports reconnection via Last-Event-ID header or query param.

    Authentication: Session cookie or Bearer token (EventSource sends cookies automatically)
    Reconnection: Last-Event-ID via header or ?lastEventId= query param
    """
    # Validate execution_id format (exec-{12 hex chars})
    EXECUTION_ID_PATTERN = re.compile(r"^exec-[a-f0-9]{12}$")
    if not execution_id or not EXECUTION_ID_PATTERN.match(execution_id):
        raise HTTPException(status_code=400, detail="Invalid execution_id format")

    # Validate Last-Event-ID
    SAFE_EVENT_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]{1,200}$")
    effective_last_event_id = last_event_id or lastEventId
    if effective_last_event_id and not SAFE_EVENT_ID_PATTERN.match(effective_last_event_id):
        effective_last_event_id = None

    ring_store = get_ring_buffer_store()
    translator = StreamTranslator(execution_id)

    async def event_generator():
        try:
            logger.info(
                "sse_connection_established",
                execution_id=execution_id,
                user_id=current_user.id,
                last_event_id=effective_last_event_id,
            )

            # Replay missed events on reconnection
            if effective_last_event_id:
                ring_buffer = ring_store.get(execution_id)
                if ring_buffer:
                    missed = ring_buffer.get_events_since(effective_last_event_id)
                    logger.info("replaying_missed_events", count=len(missed))
                    for evt in missed:
                        yield evt.to_sse_string()

            # Get the active compiled graph for this execution
            active = get_active_execution(execution_id)
            if not active:
                import json
                yield f'event: error\ndata: {json.dumps({"error": "Execution not found or already completed"})}\n\n'
                return

            compiled_graph = active["graph"]
            config = active["config"]

            # Stream LangGraph events and translate to SSE
            async for event in compiled_graph.astream_events(
                input=None,  # Already started, just subscribing to events
                config=config,
                version="v2",
            ):
                # Check if client disconnected
                if await request.is_disconnected():
                    logger.info("sse_client_disconnected", execution_id=execution_id)
                    break

                sse_event = translator.translate_event(event)
                if sse_event:
                    yield sse_event.to_sse_string()

                    # If workflow_complete, close the stream
                    if sse_event.event_type == "workflow_complete":
                        break

        except Exception as e:
            logger.exception("sse_stream_error", execution_id=execution_id, error=str(e))
            import json
            safe_error = json.dumps({"error": "Internal execution error"})
            yield f"event: error\ndata: {safe_error}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/report/{execution_id}", response_model=WorkflowReport)
async def get_workflow_report(
    execution_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get execution status and results.

    Returns execution status, node results, and timing information.
    Enforces tenant isolation.
    """
    # TODO: Query executions table once it exists
    # query = select(ExecutionRecord).where(
    #     ExecutionRecord.execution_id == execution_id,
    #     ExecutionRecord.user_id == current_user.id,
    #     ExecutionRecord.tenant_id == current_user.currentTenantId,
    # )
    # result = await db.execute(query)
    # execution = result.scalar_one_or_none()
    #
    # if not execution:
    #     raise HTTPException(status_code=404, detail="Execution not found")

    # Mock response for now
    logger.info(
        "workflow_report_requested",
        execution_id=execution_id,
        user_id=current_user.id,
    )

    # Return stub data
    return WorkflowReport(
        executionId=execution_id,
        status="running",
        totalDurationMs=0,
        nodeResults={},
        startedAt=datetime.utcnow().isoformat() + "Z",
    )


# ===== Node Type Registry Endpoints =====


@router.get("/node-types")
async def get_node_types(
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Get all registered node types.
    Returns core nodes + skill nodes (skill nodes added in section-05).
    """
    registry = NodeRegistry.get_instance()
    node_types = registry.get_all_node_types()

    return {
        "node_types": [
            {
                "type": spec.type,
                "display_name": spec.display_name,
                "description": spec.description,
                "icon": spec.icon,
                "color": spec.color,
                "category": spec.category,
                "inputs": [
                    {
                        "name": inp.name,
                        "display_name": inp.display_name,
                        "data_type": inp.data_type,
                        "ui_type": inp.ui_type,
                        "required": inp.required,
                        "accepts_connection": inp.accepts_connection,
                        "default": inp.default,
                        "options": inp.options,
                        "options_endpoint": inp.options_endpoint,
                        "validation": inp.validation,
                        "placeholder": inp.placeholder,
                    }
                    for inp in spec.inputs
                ],
                "outputs": [
                    {
                        "name": out.name,
                        "display_name": out.display_name,
                        "data_type": out.data_type,
                    }
                    for out in spec.outputs
                ],
                "executor": spec.executor,
            }
            for spec in node_types
        ]
    }


@router.get("/available-models")
async def get_available_models(
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Get available LLM models with cost and quality info, sorted by recommendation.
    """
    # TODO: Integrate with existing LLM Gateway provider registry
    # For now, return stub structure
    models = [
        {
            "id": "gpt-4o-mini",
            "name": "GPT-4o Mini",
            "provider": "openai",
            "cost_per_token": 0.00015,
            "quality_rating": 8.5,
            "recommendation_score": 9.2,
            "recommended": True,
        },
        {
            "id": "gpt-4o",
            "name": "GPT-4o",
            "provider": "openai",
            "cost_per_token": 0.00250,
            "quality_rating": 9.5,
            "recommendation_score": 8.8,
            "recommended": False,
        },
        {
            "id": "claude-3-5-sonnet-20241022",
            "name": "Claude 3.5 Sonnet",
            "provider": "anthropic",
            "cost_per_token": 0.00300,
            "quality_rating": 9.8,
            "recommendation_score": 8.5,
            "recommended": False,
        },
    ]

    # Sort by recommendation_score descending
    models.sort(key=lambda m: m.get("recommendation_score", 0), reverse=True)

    return {"models": models}


@router.get("/rag-collections")
async def get_rag_collections(
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Get RAG collections for current tenant.
    """
    # TODO: Query pgvector collections filtered by tenant_id
    # For now, return stub
    return {
        "collections": [
            {"id": "default", "name": "Default Collection", "doc_count": 42}
        ]
    }


@router.get("/available-approvers")
async def get_available_approvers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get users available as approvers for current tenant.
    """
    # Query users in same tenant (if tenant exists)
    if not current_user.currentTenantId:
        return {"approvers": []}

    result = await db.execute(
        select(User.id, User.name, User.email)
        .where(User.currentTenantId == current_user.currentTenantId)
        .where(User.id != current_user.id)  # Exclude self
    )
    users = result.all()

    return {
        "approvers": [
            {"id": str(u.id), "name": u.name, "email": u.email}
            for u in users
        ]
    }


@router.get("/image-providers")
async def get_image_providers(
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Get available image generation providers.
    """
    # TODO: Integrate with MediaTaskService provider registry
    return {
        "providers": [
            {
                "id": "openai",
                "name": "DALL-E 3",
                "sizes": ["1024x1024", "1024x1792", "1792x1024"],
                "qualities": ["standard", "hd"],
                "styles": ["natural", "vivid"],
            },
            {
                "id": "stability",
                "name": "Stable Diffusion XL",
                "sizes": ["1024x1024", "1152x896", "896x1152"],
                "qualities": ["standard", "premium"],
                "styles": ["photographic", "digital-art", "anime"],
            },
        ]
    }
