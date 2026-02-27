"""Workflow API endpoints."""
import asyncio
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.models.workflow import Workflow
from app.models.workflow_execution import WorkflowExecution
from app.models.workflow_dlq import WorkflowDeadLetterQueue
from app.models.workflow_schedule import WorkflowSchedule
from app.models.workflow_event_subscription import WorkflowEventSubscription
from app.orchestrator.cost_estimator import CostEstimator
from app.orchestrator.execution_registry import get_active_execution, register_execution, unregister_execution
from app.orchestrator.langgraph_runtime import get_langgraph_runtime
from app.orchestrator.node_executors.skill_executor import discover_available_skills
from app.orchestrator.node_registry import NodeRegistry
from app.orchestrator.ring_buffer import get_ring_buffer_store
from app.orchestrator.stream_translator import StreamTranslator
from app.orchestrator.workflow_compiler import WorkflowCompiler, CompilationError
from app.orchestrator.workflow_generator import WorkflowGenerator, WorkflowGenerationError
from app.orchestrator.workflow_validator import WorkflowGenerateStatusResponse

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


class WorkflowGenerateRequest(BaseModel):
    """Request to auto-generate a workflow from a natural language prompt."""

    prompt: str = Field(..., min_length=10, max_length=50000)
    node_types: list[dict[str, Any]] | None = Field(
        default=None, description="Available node type specs for LLM context"
    )
    model_id: str | None = Field(
        default=None, description="LLM model for the generation call itself"
    )
    default_model: str | None = Field(
        default=None, description="Workflow-level default model for llm_call nodes in the generated workflow"
    )


class WorkflowGenerateResponse(BaseModel):
    """Response from workflow auto-generation."""

    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    description: str


class WorkflowGenerateSubmitResponse(BaseModel):
    """Response from async workflow generation submission."""

    task_id: str
    status: str  # "queued"


class WorkflowEditRequest(BaseModel):
    """Request to auto-edit/fix an existing workflow using AI."""

    current_workflow: dict[str, Any] = Field(..., description="Current ReactFlow workflow JSON")
    errors: list[str] = Field(default_factory=list, description="Compilation errors to fix", max_length=50)
    warnings: list[str] = Field(default_factory=list, description="Compilation warnings to address", max_length=50)
    instructions: str = Field(default="", max_length=5000, description="Optional user instructions")
    node_types: list[dict[str, Any]] | None = Field(
        default=None, description="Available node type specs for LLM context"
    )
    model_id: str | None = Field(default=None, description="LLM model for the edit call itself")
    default_model: str | None = Field(
        default=None, description="Workflow-level default model for llm_call nodes"
    )


class WorkflowEditSubmitResponse(BaseModel):
    """Response from async workflow edit submission."""

    task_id: str
    status: str  # "queued"


class WorkflowEditStatusResponse(BaseModel):
    """Response from workflow edit task status poll."""

    status: str  # queued | processing | completed | failed
    message: str | None = None
    error: str | None = None
    validationError: str | None = None
    hint: str | None = None
    nodes: list[dict[str, Any]] | None = None
    edges: list[dict[str, Any]] | None = None
    description: str | None = None
    changes: list[str] | None = None


class ExecuteWorkflowRequest(BaseModel):
    """Request to execute a compiled workflow."""

    workflowJson: dict[str, Any] = Field(..., description="Compiled workflow JSON with _compiledMetadata")
    workflow_id: int | None = Field(default=None, description="Saved workflow ID (from Node.js router)")
    tenant_id: str | None = Field(default=None, description="Tenant ID (from Node.js router context)")
    input_data: dict[str, Any] | None = Field(
        default=None,
        description="Optional input data for the trigger node",
    )


class ExecuteWorkflowResponse(BaseModel):
    """Response from workflow execution start."""

    executionId: str
    status: str
    startedAt: str


class ResumeWorkflowRequest(BaseModel):
    """Request to resume a paused workflow (HITL response)."""

    response: dict[str, Any] = Field(
        ..., description="User response to the interrupt (e.g., {'approved': true, 'comment': '...'})"
    )


class ResumeWorkflowResponse(BaseModel):
    """Response from workflow resume."""

    executionId: str
    status: str  # "running" (resumed)
    resumedAt: str


class DLQItemResponse(BaseModel):
    """A single DLQ item."""

    id: str
    workflow_id: str | None
    execution_id: str
    node_id: str
    input_data: dict[str, Any]
    error: str
    retry_count: int
    status: str
    created_at: str


class DLQListResponse(BaseModel):
    """Paginated DLQ list."""

    items: list[DLQItemResponse]
    total: int


class DLQReprocessRequest(BaseModel):
    """Optional overrides for DLQ reprocessing."""

    override_input: dict[str, Any] | None = Field(
        default=None,
        description="Override the original input data for the retry",
    )


class DLQReprocessResponse(BaseModel):
    """Response from DLQ reprocessing."""

    dlq_id: str
    new_execution_id: str | None  # ID of the retry execution, if applicable
    status: str  # "reprocessing"


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


@router.post("/generate", response_model=WorkflowGenerateSubmitResponse)
async def generate_workflow(
    body: WorkflowGenerateRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user),
):
    """
    Submit async workflow generation to the task queue.

    Returns a task_id immediately. The client polls /generate/status/{task_id}
    until the result is ready. This handles concurrent users safely.
    """
    from app.tasks.workflow_gen_tasks import generate_workflow_task, create_task_id, _set_status

    # Extract user JWT from Authorization header so the gateway can track credits
    auth_header = http_request.headers.get("authorization", "")
    user_token: str | None = None
    if auth_header.lower().startswith("bearer "):
        user_token = auth_header.split(" ", 1)[1].strip()

    task_id = create_task_id()

    # Set initial queued status in Redis (H-01: include user_id for ownership tracking)
    _set_status(task_id, {
        "status": "queued",
        "message": "Waiting in queue...",
        "_user_id": current_user.id,
    })

    # Submit to Celery queue
    try:
        generate_workflow_task.delay(
            task_id=task_id,
            prompt=body.prompt,
            node_types=body.node_types,
            model=body.model_id,
            default_model=body.default_model,
            user_token=user_token,
            user_id=current_user.id,
        )
    except Exception as exc:
        logger.error("workflow_gen_queue_submit_failed", error=str(exc))
        # Fallback: run synchronously if Celery is not available
        logger.warning("workflow_gen_falling_back_to_sync", task_id=task_id)
        _set_status(task_id, {
            "status": "processing",
            "message": "Running directly (queue unavailable)...",
            "_user_id": current_user.id,
        })
        try:
            generator = WorkflowGenerator()
            result = await generator.generate(
                prompt=body.prompt,
                node_types=body.node_types,
                model=body.model_id,
                user_token=user_token,
                default_model=body.default_model,
            )
            _set_status(task_id, {
                "status": "completed",
                "result": result,
                "_user_id": current_user.id,
            })
        except WorkflowGenerationError as gen_exc:
            _set_status(task_id, {
                "status": "failed",
                "error": gen_exc.message,
                "_user_id": current_user.id,
            })
        except Exception as gen_exc:
            logger.error("workflow_gen_sync_error", error=str(gen_exc), exc_info=True)
            _set_status(task_id, {
                "status": "failed",
                "error": "An internal error occurred. Please try again.",
                "_user_id": current_user.id,
            })

    logger.info(
        "workflow_gen_submitted",
        task_id=task_id,
        user_id=current_user.id,
        prompt_length=len(body.prompt),
    )

    return WorkflowGenerateSubmitResponse(task_id=task_id, status="queued")


@router.get("/generate/status/{task_id}", response_model=WorkflowGenerateStatusResponse)
async def get_generate_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Poll workflow generation task status.

    Returns current status and result when completed.
    """
    from app.tasks.workflow_gen_tasks import get_status

    # Validate task_id format
    if not task_id.startswith("wfgen-") or len(task_id) != 18:
        raise HTTPException(status_code=400, detail="Invalid task_id format")

    # H-01: Enforce ownership — returns None if user doesn't own this task
    status_data = get_status(task_id, user_id=current_user.id)
    if status_data is None:
        raise HTTPException(status_code=404, detail="Task not found or expired")

    status = status_data.get("status", "unknown")

    if status == "completed":
        result = status_data.get("result", {})
        return WorkflowGenerateStatusResponse(
            status="completed",
            nodes=result.get("nodes", []),
            edges=result.get("edges", []),
            description=result.get("description", ""),
        )
    elif status == "failed":
        return WorkflowGenerateStatusResponse(
            status="failed",
            error=status_data.get("error", "Unknown error"),
            validationError=status_data.get("validationError"),
            hint=status_data.get("hint"),
        )
    else:
        return WorkflowGenerateStatusResponse(
            status=status,
            message=status_data.get("message"),
        )


@router.post("/edit", response_model=WorkflowEditSubmitResponse)
async def edit_workflow(
    body: WorkflowEditRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user),
):
    """
    Submit async workflow editing to the task queue.

    Returns a task_id immediately. The client polls /edit/status/{task_id}
    until the result is ready.
    """
    from app.tasks.workflow_edit_tasks import edit_workflow_task, create_edit_task_id, _set_edit_status
    from app.orchestrator.workflow_editor import WorkflowEditor, WorkflowEditError

    auth_header = http_request.headers.get("authorization", "")
    user_token: str | None = None
    if auth_header.lower().startswith("bearer "):
        user_token = auth_header.split(" ", 1)[1].strip()

    task_id = create_edit_task_id()

    _set_edit_status(task_id, {
        "status": "queued",
        "message": "Waiting in queue...",
        "_user_id": current_user.id,
    })

    try:
        edit_workflow_task.delay(
            task_id=task_id,
            current_workflow=body.current_workflow,
            errors=body.errors,
            warnings=body.warnings,
            instructions=body.instructions,
            node_types=body.node_types,
            model=body.model_id,
            default_model=body.default_model,
            user_token=user_token,
            user_id=current_user.id,
        )
    except Exception as exc:
        logger.error("workflow_edit_queue_submit_failed", error=str(exc))
        # Fallback: run synchronously if Celery is not available
        logger.warning("workflow_edit_falling_back_to_sync", task_id=task_id)
        _set_edit_status(task_id, {
            "status": "processing",
            "message": "Running directly (queue unavailable)...",
            "_user_id": current_user.id,
        })
        try:
            editor = WorkflowEditor()
            result = await editor.edit(
                current_workflow=body.current_workflow,
                errors=body.errors,
                warnings=body.warnings,
                instructions=body.instructions,
                node_types=body.node_types,
                model=body.model_id,
                user_token=user_token,
                default_model=body.default_model,
            )
            _set_edit_status(task_id, {
                "status": "completed",
                "result": result,
                "_user_id": current_user.id,
            })
        except WorkflowEditError as edit_exc:
            _set_edit_status(task_id, {
                "status": "failed",
                "error": edit_exc.message,
                "_user_id": current_user.id,
            })
        except Exception as edit_exc:
            logger.error("workflow_edit_sync_error", error=str(edit_exc), exc_info=True)
            _set_edit_status(task_id, {
                "status": "failed",
                "error": "An internal error occurred. Please try again.",
                "_user_id": current_user.id,
            })

    logger.info(
        "workflow_edit_submitted",
        task_id=task_id,
        user_id=current_user.id,
        error_count=len(body.errors),
        warning_count=len(body.warnings),
    )

    return WorkflowEditSubmitResponse(task_id=task_id, status="queued")


@router.get("/edit/status/{task_id}", response_model=WorkflowEditStatusResponse)
async def get_edit_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Poll workflow edit task status."""
    from app.tasks.workflow_edit_tasks import get_edit_status as _get_edit_status

    if not task_id.startswith("wfedit-") or len(task_id) != 19:
        raise HTTPException(status_code=400, detail="Invalid task_id format")

    status_data = _get_edit_status(task_id, user_id=current_user.id)
    if status_data is None:
        raise HTTPException(status_code=404, detail="Task not found or expired")

    status = status_data.get("status", "unknown")

    if status == "completed":
        result = status_data.get("result", {})
        return WorkflowEditStatusResponse(
            status="completed",
            nodes=result.get("nodes", []),
            edges=result.get("edges", []),
            description=result.get("description", ""),
            changes=result.get("changes", []),
        )
    elif status == "failed":
        return WorkflowEditStatusResponse(
            status="failed",
            error=status_data.get("error", "Unknown error"),
            validationError=status_data.get("validationError"),
            hint=status_data.get("hint"),
        )
    else:
        return WorkflowEditStatusResponse(
            status=status,
            message=status_data.get("message"),
        )


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

        # Section 14: Use WorkflowCompiler from Section 01
        compiler = WorkflowCompiler()
        result = compiler.compile(flow_json, metadata=metadata)

        logger.info(
            "flow_compiled_successfully",
            user_id=current_user.id,
            node_count=len(flow_json.get("nodes", [])),
            edge_count=len(flow_json.get("edges", [])),
        )

        # result is a CompileResult(graph, warnings). The graph is a
        # CompiledStateGraph — not JSON-serialisable — so we build a
        # lightweight manifest dict from the input for the frontend.
        return FlowCompileResponse(
            success=True,
            manifest={
                "nodes": flow_json.get("nodes", []),
                "edges": flow_json.get("edges", []),
                "metadata": metadata,
                "node_count": len(flow_json.get("nodes", [])),
                "edge_count": len(flow_json.get("edges", [])),
            },
            warnings=result.warnings or None,
        )

    except CompilationError as e:
        logger.warning(
            "flow_compilation_failed",
            user_id=current_user.id,
            errors=e.errors,
        )
        return FlowCompileResponse(
            success=False,
            errors=e.errors,
            error=e.errors[0] if e.errors else str(e),
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
    http_request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Execute a compiled workflow using LangGraphRuntime.

    Validates workflow is compiled, checks credit balance, and starts execution.
    Returns execution_id for tracking status.
    """
    workflow_json = request.workflowJson
    auth_header = http_request.headers.get("authorization", "")
    user_token: str = ""
    if auth_header.lower().startswith("bearer "):
        user_token = auth_header.split(" ", 1)[1].strip()

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

    # 2. Estimate cost and check credits
    cost_estimator = CostEstimator()
    cost_result = cost_estimator.estimate(workflow_json)
    estimated_cost = cost_result["total"]

    user_balance = getattr(current_user, "creditBalance", 100.0)
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

    # 3. Create execution record in workflow_executions table (Section 13)
    execution_id = f"exec-{uuid.uuid4().hex[:12]}"
    started_at = datetime.utcnow()

    execution_record = WorkflowExecution(
        id=execution_id,
        workflow_id=str(request.workflow_id) if request.workflow_id is not None else None,
        tenant_id=request.tenant_id or current_user.currentTenantId or None,
        user_id=current_user.id,
        status="running",
        input_data=request.input_data or {},
        started_at=started_at,
        node_count=len(workflow_json.get("nodes", [])),
    )
    db.add(execution_record)
    await db.commit()

    # 4. Compile the workflow graph using LangGraphRuntime (Section 01)
    runtime = get_langgraph_runtime()

    try:
        compile_result = await runtime.compile(workflow_json)
        compiled_graph = compile_result.graph
    except CompilationError as e:
        await db.rollback()
        logger.error("workflow_compilation_failed_on_execute", execution_id=execution_id, errors=e.errors)
        raise HTTPException(status_code=400, detail=f"Failed to compile workflow: {e.errors[0] if e.errors else str(e)}")

    # 5. Build config
    resolved_tenant_id = request.tenant_id or current_user.currentTenantId or str(current_user.id)
    resolved_workflow_id = request.workflow_id or workflow_json.get("id")
    input_data = request.input_data or {}
    config = {
        "configurable": {
            "thread_id": f"{resolved_tenant_id}:{execution_id}",
            "user_id": current_user.id,
            "tenant_id": resolved_tenant_id,
            "workflow_id": resolved_workflow_id,
            "execution_id": execution_id,
            "credits_available": user_balance,
            "form_values": input_data.get("form_values", {}),
            "user_token": user_token,
        }
    }

    # 6. Register execution in execution_registry — execution is DRIVEN by the
    #    SSE stream endpoint, not started here.  This avoids a race condition
    #    where the graph completes before the SSE client connects.
    register_execution(execution_id, compiled_graph, config, input_data)

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
        startedAt=started_at.isoformat() + "Z",
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


@router.post("/webhook/{webhook_id}")
async def receive_webhook(
    webhook_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Webhook receiver endpoint for triggering workflows via HTTP.

    This endpoint:
    1. Receives webhook requests at a unique URL
    2. Extracts request data (method, headers, query, body)
    3. Looks up the workflow associated with this webhook_id
    4. Injects webhook_request data into extra_data
    5. Triggers workflow execution
    6. Returns response (sync or async based on workflow config)

    Note: This is a simplified implementation. Production version would include:
    - webhooks table with webhook_id -> workflow_id mapping
    - Authentication/authorization checks
    - Rate limiting
    - Signature verification (for GitHub, Stripe, etc.)
    """
    # H-09: Only forward safe, relevant headers — never auth/cookie/internal headers.
    _SAFE_WEBHOOK_HEADERS = {
        "content-type", "content-length", "user-agent",
        "x-github-event", "x-hub-signature-256", "x-hub-signature",
        "stripe-signature", "x-request-id",
    }
    method = request.method
    headers = {
        k.lower(): v for k, v in request.headers.items()
        if k.lower() in _SAFE_WEBHOOK_HEADERS
    }
    query = dict(request.query_params)

    # Parse request body
    content_type = headers.get("content-type", "")
    body = None
    try:
        if "application/json" in content_type:
            body = await request.json()
        else:
            body_bytes = await request.body()
            body = body_bytes.decode("utf-8") if body_bytes else ""
    except Exception as e:
        logger.warning("webhook_body_parse_failed", webhook_id=webhook_id, error=str(e))
        body = ""

    # Build webhook_request data to inject into workflow
    webhook_request = {
        "method": method,
        "headers": headers,
        "query": query,
        "body": body,
        "path": request.url.path,
    }

    logger.info(
        "webhook_received",
        webhook_id=webhook_id,
        method=method,
        content_type=content_type,
        query_params=query,
    )

    # Parse webhook_id format: "workflow-{workflowId}-{nodeId}"
    # In production, this would lookup from a webhooks table
    try:
        parts = webhook_id.split("-")
        if len(parts) < 3 or parts[0] != "workflow":
            raise HTTPException(
                status_code=400,
                detail="Invalid webhook_id format. Expected: workflow-{workflowId}-{nodeId}",
            )

        workflow_id = parts[1]
        node_id = "-".join(parts[2:])  # Support node IDs with hyphens

        # Verify workflow exists and is active
        result = await db.execute(
            select(Workflow).where(
                Workflow.id == int(workflow_id),
                Workflow.status == "active",
            )
        )
        workflow = result.scalar_one_or_none()

        if not workflow:
            raise HTTPException(
                status_code=404,
                detail=f"Workflow {workflow_id} not found or inactive",
            )

        # Execute workflow asynchronously via Celery
        from app.tasks.workflow_tasks import execute_webhook_workflow
        task = execute_webhook_workflow.delay(
            workflow_id=workflow_id,
            node_id=node_id,
            webhook_request=webhook_request,
        )

        logger.info(
            "webhook_workflow_triggered",
            webhook_id=webhook_id,
            workflow_id=workflow_id,
            node_id=node_id,
            task_id=task.id,
        )

        return {
            "status": "triggered",
            "webhookId": webhook_id,
            "workflowId": workflow_id,
            "executionId": task.id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": "Workflow execution started",
        }

    except HTTPException:
        raise
    except Exception as e:
        # H-02: Log full error server-side, return sanitized message to client
        logger.exception("webhook_execution_failed", webhook_id=webhook_id, error=str(e))
        raise HTTPException(
            status_code=500,
            detail="Webhook execution failed. Please check the workflow configuration.",
        )


@router.get("/execute/{execution_id}/stream")
async def stream_workflow_execution(
    execution_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
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

    # Section 14: Verify execution exists and belongs to user's tenant
    result = await db.execute(
        select(WorkflowExecution).where(
            WorkflowExecution.id == execution_id,
            WorkflowExecution.tenant_id == current_user.currentTenantId,
        )
    )
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    ring_store = get_ring_buffer_store()
    translator = StreamTranslator(execution_id)

    async def event_generator():
        import json as _json
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

            # Get the registered execution entry
            active = get_active_execution(execution_id)
            if not active:
                yield f'event: workflow_error\ndata: {_json.dumps({"error": "Execution not found"})}\n\n'
                return

            compiled_graph = active["graph"]
            config = active["config"]
            input_data = active.get("input_data") or {}

            # Build initial LangGraph state from input_data
            from app.orchestrator.workflow_state import WorkflowState
            initial_state: WorkflowState = {
                "node_outputs": {},
                "current_node": "",
                "messages": [],
                "errors": [],
                "audit_trail": [],
                "cache_hits": 0,
                "schema_version": 1,
                **input_data,
            }

            # Drive execution via astream_events — this starts AND streams simultaneously
            event_count = 0
            translated_count = 0
            async for event in compiled_graph.astream_events(
                initial_state,
                config=config,
                version="v2",
            ):
                event_count += 1
                event_type = event.get("event", "")
                metadata = event.get("metadata", {})
                node_name = metadata.get("langgraph_node", "")

                # Debug: log every chain/custom event to trace filtering
                if event_type in ("on_chain_start", "on_chain_end", "on_chain_error", "on_custom_event"):
                    logger.info(
                        "sse_raw_event",
                        execution_id=execution_id,
                        event_type=event_type,
                        node_name=node_name,
                        metadata_keys=list(metadata.keys()),
                    )

                # Check if client disconnected
                if await request.is_disconnected():
                    logger.info("sse_client_disconnected", execution_id=execution_id)
                    return

                sse_event = translator.translate_event(event)
                if sse_event:
                    translated_count += 1
                    logger.info(
                        "sse_event_translated",
                        execution_id=execution_id,
                        sse_type=sse_event.event_type,
                        node_name=node_name,
                    )
                    yield sse_event.to_sse_string()

                    # If workflow_complete custom event, stop
                    if sse_event.event_type == "workflow_complete":
                        return

            logger.info(
                "sse_stream_finished",
                execution_id=execution_id,
                total_events=event_count,
                translated_events=translated_count,
            )
            # Graph finished without emitting workflow_complete — send it now
            yield f'event: workflow_complete\ndata: {_json.dumps({"executionId": execution_id})}\n\n'

        except Exception as e:
            logger.exception("sse_stream_error", execution_id=execution_id, error=str(e))
            safe_error = _json.dumps({"error": str(e)})
            yield f"event: workflow_error\ndata: {safe_error}\n\n"
        finally:
            unregister_execution(execution_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/execute/{execution_id}/resume", response_model=ResumeWorkflowResponse)
async def resume_workflow(
    execution_id: str,
    request: ResumeWorkflowRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Resume a paused workflow after HITL interrupt.

    This endpoint:
    1. Verifies execution exists and is in interrupted state
    2. Calls LangGraphRuntime.resume() with user response
    3. Updates execution status to running
    """
    EXECUTION_ID_PATTERN = re.compile(r"^exec-[a-f0-9]{12}$")
    if not EXECUTION_ID_PATTERN.match(execution_id):
        raise HTTPException(status_code=400, detail="Invalid execution_id format")

    # Verify execution exists and belongs to tenant
    result = await db.execute(
        select(WorkflowExecution).where(
            WorkflowExecution.id == execution_id,
            WorkflowExecution.tenant_id == current_user.currentTenantId,
        )
    )
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    if execution.status != "interrupted":
        raise HTTPException(status_code=409, detail="Execution is not paused at an interrupt")

    # Resume via LangGraph runtime (Section 03)
    runtime = get_langgraph_runtime()
    thread_id = f"{current_user.currentTenantId}:{execution_id}"

    # Get the active compiled graph from execution registry
    from app.orchestrator.execution_registry import get_active_execution

    active = get_active_execution(execution_id)
    if not active:
        raise HTTPException(status_code=404, detail="Active execution not found in registry")

    compiled_graph = active["graph"]

    # Build Command with resume value (Section 03)
    from langgraph.types import Command

    command = Command(resume=request.response)

    try:
        await runtime.resume(compiled_graph, thread_id, command)
    except Exception as e:
        logger.exception("workflow_resume_failed", execution_id=execution_id)
        raise HTTPException(status_code=500, detail="Failed to resume workflow") from e

    # Update execution status
    execution.status = "running"
    await db.commit()

    resumed_at = datetime.utcnow()
    logger.info("workflow_resumed", execution_id=execution_id, user_id=current_user.id)

    return ResumeWorkflowResponse(
        executionId=execution_id,
        status="running",
        resumedAt=resumed_at.isoformat() + "Z",
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
    # LOW-18: Validate execution_id format (same pattern as stream/resume endpoints)
    EXECUTION_ID_PATTERN = re.compile(r"^exec-[a-f0-9]{12}$")
    if not execution_id or not EXECUTION_ID_PATTERN.match(execution_id):
        raise HTTPException(status_code=400, detail="Invalid execution_id format")

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
async def get_node_types() -> dict:
    """
    Get all registered node types (public endpoint - no auth required).
    Returns core nodes + skill nodes (skill nodes added in section-05).

    NOTE: This endpoint is intentionally public as it only returns metadata
    about available node types, not sensitive user data.
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
                        "depends_on": inp.depends_on,
                        "option_groups": inp.option_groups,
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
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get available LLM models from model_provider_map, joined with llm_providers.
    Returns unique models with provider info, sorted by priority.
    """
    from sqlalchemy import text as sa_text

    query = sa_text("""
        SELECT DISTINCT ON (mpm."modelId")
            mpm."modelId" AS id,
            mpm."modelName" AS name,
            lp."providerName" AS provider,
            mpm."pricingInput" AS pricing_input,
            mpm."pricingOutput" AS pricing_output,
            mpm."isFree" AS is_free,
            mpm."contextLength" AS context_length,
            mpm.priority
        FROM model_provider_map mpm
        INNER JOIN llm_providers lp ON mpm."providerId" = lp.id
        WHERE mpm."isEnabled" = true AND lp."isEnabled" = true
        ORDER BY mpm."modelId", mpm.priority ASC
    """)
    result = await db.execute(query)
    rows = result.mappings().all()

    models = []
    for row in rows:
        pricing_input = float(row.get("pricing_input") or 0)
        pricing_output = float(row.get("pricing_output") or 0)
        is_free = bool(row.get("is_free", False))
        provider = row.get("provider", "")
        model_name = row["name"]

        # Build display label: "Model Name (Provider)" or "Model Name [FREE]"
        label = model_name
        if provider:
            label = f"{model_name} ({provider})"
        if is_free:
            label = f"{label} [FREE]"

        models.append({
            "id": row["id"],
            "name": label,
            "provider": provider,
            "pricingInput": pricing_input,
            "pricingOutput": pricing_output,
            "isFree": is_free,
            "contextLength": row.get("context_length"),
            "priority": row.get("priority", 0),
        })

    # Sort: free models first, then by priority ascending
    models.sort(key=lambda m: (0 if m["isFree"] else 1, m.get("priority", 0)))

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


@router.get("/dlq", response_model=DLQListResponse)
async def list_dlq_items(
    workflow_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(default=50, le=200, ge=1),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List Dead Letter Queue items for the current tenant.

    Supports filtering by workflow_id and status (pending, reprocessed, discarded).
    Returns paginated results.
    """
    query = select(WorkflowDeadLetterQueue).where(
        WorkflowDeadLetterQueue.tenant_id == current_user.currentTenantId
    )
    count_query = select(func.count()).select_from(WorkflowDeadLetterQueue).where(
        WorkflowDeadLetterQueue.tenant_id == current_user.currentTenantId
    )

    if workflow_id:
        query = query.where(WorkflowDeadLetterQueue.workflow_id == workflow_id)
        count_query = count_query.where(WorkflowDeadLetterQueue.workflow_id == workflow_id)
    if status:
        query = query.where(WorkflowDeadLetterQueue.status == status)
        count_query = count_query.where(WorkflowDeadLetterQueue.status == status)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(WorkflowDeadLetterQueue.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    items = result.scalars().all()

    return DLQListResponse(
        items=[
            DLQItemResponse(
                id=str(item.id),
                workflow_id=item.workflow_id,
                execution_id=item.execution_id,
                node_id=item.node_id,
                input_data=item.input_data or {},
                error=item.error or "",
                retry_count=item.retry_count,
                status=item.status,
                created_at=item.created_at.isoformat() + "Z",
            )
            for item in items
        ],
        total=total,
    )


@router.post("/dlq/{dlq_id}/reprocess", response_model=DLQReprocessResponse)
async def reprocess_dlq_item(
    dlq_id: str,
    request: DLQReprocessRequest = DLQReprocessRequest(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Reprocess a Dead Letter Queue item.

    Retrieves the failed node execution, optionally allows overriding input data,
    and triggers re-execution via LangGraphRuntime.
    """
    result = await db.execute(
        select(WorkflowDeadLetterQueue).where(
            WorkflowDeadLetterQueue.id == int(dlq_id),
            WorkflowDeadLetterQueue.tenant_id == current_user.currentTenantId,
        )
    )
    dlq_item = result.scalar_one_or_none()
    if not dlq_item:
        raise HTTPException(status_code=404, detail="DLQ item not found")
    if dlq_item.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"DLQ item is already {dlq_item.status}; cannot reprocess",
        )

    # Update DLQ status
    dlq_item.status = "reprocessing"
    dlq_item.retry_count += 1
    await db.commit()

    # Trigger re-execution (fire-and-forget)
    runtime = get_langgraph_runtime()
    input_data = request.override_input or dlq_item.input_data

    new_execution_id = f"exec-{uuid.uuid4().hex[:12]}"

    asyncio.create_task(
        runtime.reprocess_dlq_item(
            dlq_item_id=dlq_item.id,
            node_id=dlq_item.node_id,
            input_data=input_data,
            execution_id=new_execution_id,
            tenant_id=current_user.currentTenantId,
            user_id=current_user.id,
        )
    )

    logger.info(
        "dlq_reprocess_started",
        dlq_id=dlq_id,
        new_execution_id=new_execution_id,
        user_id=current_user.id,
    )

    return DLQReprocessResponse(
        dlq_id=dlq_id,
        new_execution_id=new_execution_id,
        status="reprocessing",
    )


@router.get("/media-models")
async def get_media_models(
    type: str = Query(default="image", description="Media type filter: image, video, audio"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get available media generation models from database.

    Returns the same data as the tRPC mediaModels.list endpoint.
    Each model includes configJson with inputFields for dynamic UI rendering.
    """
    from sqlalchemy import text as sa_text

    query = sa_text("""
        SELECT "modelId", name, description, "modelType", provider,
               "creditCost", "aspectRatios", sizes, durations, voices,
               "configJson", priority
        FROM media_models
        WHERE "isEnabled" = true
        AND (CAST(:type_filter AS text) IS NULL OR "modelType"::text = :type_filter)
        ORDER BY "sortOrder" ASC NULLS LAST, priority ASC NULLS LAST
    """)

    result = await db.execute(query, {"type_filter": type or None})
    rows = result.mappings().all()

    models = []
    for row in rows:
        models.append({
            "id": row["modelId"],
            "name": row["name"],
            "description": row.get("description"),
            "type": row["modelType"],
            "provider": row["provider"],
            "creditCost": row["creditCost"],
            "aspectRatios": row.get("aspectRatios"),
            "sizes": row.get("sizes"),
            "durations": row.get("durations"),
            "voices": row.get("voices"),
            "configJson": row.get("configJson"),
            "priority": row.get("priority"),
        })

    return {"models": models}


@router.get("/image-providers", deprecated=True)
async def get_image_providers(
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Deprecated: Use /media-models instead.

    Returns legacy format for backward compatibility.
    """
    logger.warning("deprecated_image_providers_endpoint_called", user_id=current_user.id)
    # Redirect to new format mapped to legacy shape
    return {
        "providers": [
            {
                "id": "kie.ai",
                "name": "Kie AI (Media Studio)",
                "models": [
                    "google-nano-banana-pro",
                    "google-banana-2",
                    "flux-2.0",
                    "z-image",
                    "grok-imagine",
                ],
                "note": "Deprecated. Use GET /media-models instead.",
            },
        ]
    }


# ============================================================================
# Schedule Management Endpoints
# ============================================================================


class CreateScheduleRequest(BaseModel):
    """Request to create/update a workflow schedule."""

    workflow_id: str = Field(..., description="Workflow ID to schedule")
    node_id: str = Field(..., description="Schedule trigger node ID")
    cron_expression: str = Field(..., description="Cron expression (5-field format)")
    timezone: str = Field(default="UTC", description="IANA timezone (e.g., Asia/Bangkok)")
    is_active: bool = Field(default=True, description="Enable/disable schedule")


class ScheduleResponse(BaseModel):
    """Response for schedule operations."""

    id: str
    workflow_id: str
    node_id: str
    cron_expression: str
    timezone: str
    is_active: bool
    next_run: str | None
    last_run: str | None
    created_at: str


class ScheduleListResponse(BaseModel):
    """Paginated schedule list."""

    items: list[ScheduleResponse]
    total: int


@router.post("/schedules", response_model=ScheduleResponse)
async def create_schedule(
    request: CreateScheduleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create or update a workflow schedule.

    The schedule will be monitored by a Celery Beat task that triggers
    the workflow when the cron expression matches.
    """
    from croniter import croniter
    from datetime import datetime
    import zoneinfo

    # Validate cron expression
    if not croniter.is_valid(request.cron_expression):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid cron expression: '{request.cron_expression}'",
        )

    # Calculate next run time
    try:
        tz = zoneinfo.ZoneInfo(request.timezone)
        now = datetime.now(tz)
        cron = croniter(request.cron_expression, now)
        next_run = cron.get_next(datetime)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid timezone or cron calculation failed: {str(e)}",
        )

    # Verify workflow exists and belongs to user's tenant
    workflow_result = await db.execute(
        select(Workflow).where(
            Workflow.id == int(request.workflow_id),
            Workflow.tenantId == current_user.currentTenantId,
        )
    )
    workflow = workflow_result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(
            status_code=404,
            detail=f"Workflow {request.workflow_id} not found or access denied",
        )

    # Create schedule in database
    schedule = WorkflowSchedule(
        workflowId=int(request.workflow_id),
        nodeId=request.node_id,
        cronExpression=request.cron_expression,
        timezone=request.timezone,
        nextRun=next_run,
        isActive=request.is_active,
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)

    logger.info(
        "schedule_created",
        schedule_id=schedule.id,
        workflow_id=request.workflow_id,
        cron=request.cron_expression,
        timezone=request.timezone,
        next_run=next_run.isoformat(),
    )

    return ScheduleResponse(
        id=str(schedule.id),
        workflow_id=request.workflow_id,
        node_id=schedule.nodeId,
        cron_expression=schedule.cronExpression,
        timezone=schedule.timezone,
        is_active=schedule.isActive,
        next_run=schedule.nextRun.isoformat() if schedule.nextRun else None,
        last_run=schedule.lastRun.isoformat() if schedule.lastRun else None,
        created_at=schedule.createdAt.isoformat(),
    )


@router.get("/schedules", response_model=ScheduleListResponse)
async def list_schedules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    """
    List all schedules for the current tenant.
    """
    # Query schedules through workflow JOIN to filter by tenant
    query = (
        select(WorkflowSchedule)
        .join(Workflow, WorkflowSchedule.workflowId == Workflow.id)
        .where(Workflow.tenantId == current_user.currentTenantId)
        .order_by(WorkflowSchedule.createdAt.desc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(query)
    schedules = result.scalars().all()

    # Get total count
    count_query = (
        select(func.count())
        .select_from(WorkflowSchedule)
        .join(Workflow, WorkflowSchedule.workflowId == Workflow.id)
        .where(Workflow.tenantId == current_user.currentTenantId)
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    logger.info(
        "schedules_list_requested",
        user_id=current_user.id,
        tenant_id=current_user.currentTenantId,
        count=len(schedules),
    )

    return ScheduleListResponse(
        items=[
            ScheduleResponse(
                id=str(schedule.id),
                workflow_id=str(schedule.workflowId),
                node_id=schedule.nodeId,
                cron_expression=schedule.cronExpression,
                timezone=schedule.timezone,
                is_active=schedule.isActive,
                next_run=schedule.nextRun.isoformat() if schedule.nextRun else None,
                last_run=schedule.lastRun.isoformat() if schedule.lastRun else None,
                created_at=schedule.createdAt.isoformat(),
            )
            for schedule in schedules
        ],
        total=total,
    )


@router.delete("/schedules/{schedule_id}")
async def delete_schedule(
    schedule_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a workflow schedule.
    """
    # Query schedule through workflow JOIN to ensure tenant isolation
    query = (
        select(WorkflowSchedule)
        .join(Workflow, WorkflowSchedule.workflowId == Workflow.id)
        .where(
            WorkflowSchedule.id == int(schedule_id),
            Workflow.tenantId == current_user.currentTenantId,
        )
    )

    result = await db.execute(query)
    schedule = result.scalar_one_or_none()

    if not schedule:
        raise HTTPException(
            status_code=404,
            detail=f"Schedule {schedule_id} not found or access denied",
        )

    await db.delete(schedule)
    await db.commit()

    logger.info(
        "schedule_deleted",
        schedule_id=schedule_id,
        user_id=current_user.id,
    )

    return {"status": "deleted", "schedule_id": schedule_id}


# ============================================================================
# Event Subscription Endpoints
# ============================================================================


class CreateEventSubscriptionRequest(BaseModel):
    """Request to create an event subscription."""

    workflow_id: str = Field(..., description="Workflow ID to trigger")
    node_id: str = Field(..., description="Event trigger node ID")
    event_type: str = Field(
        ...,
        description="Event type to listen for (e.g., user.created, skill.completed)",
    )
    filter_conditions: dict[str, Any] | None = Field(
        default=None,
        description="Optional filter conditions (key-value pairs)",
    )
    is_active: bool = Field(default=True, description="Enable/disable subscription")


class EventSubscriptionResponse(BaseModel):
    """Response for event subscription operations."""

    id: str
    workflow_id: str
    node_id: str
    event_type: str
    filter_conditions: dict[str, Any] | None
    is_active: bool
    created_at: str


class EventSubscriptionListResponse(BaseModel):
    """Paginated event subscription list."""

    items: list[EventSubscriptionResponse]
    total: int


@router.post("/event-subscriptions", response_model=EventSubscriptionResponse)
async def create_event_subscription(
    request: CreateEventSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create an event subscription.

    The subscription will be monitored by an event listener service that
    triggers the workflow when matching events occur.
    """
    # Validate event type
    valid_event_types = {
        "user.created",
        "user.updated",
        "skill.completed",
        "media.generated",
        "workflow.completed",
    }

    if request.event_type not in valid_event_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid event type. Must be one of: {', '.join(valid_event_types)}",
        )

    # Verify workflow exists and belongs to user's tenant
    workflow_result = await db.execute(
        select(Workflow).where(
            Workflow.id == int(request.workflow_id),
            Workflow.tenantId == current_user.currentTenantId,
        )
    )
    workflow = workflow_result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(
            status_code=404,
            detail=f"Workflow {request.workflow_id} not found or access denied",
        )

    # Create event subscription in database
    subscription = WorkflowEventSubscription(
        workflowId=int(request.workflow_id),
        nodeId=request.node_id,
        eventType=request.event_type,
        filterConditions=request.filter_conditions,
        isActive=request.is_active,
    )
    db.add(subscription)
    await db.commit()
    await db.refresh(subscription)

    logger.info(
        "event_subscription_created",
        subscription_id=subscription.id,
        workflow_id=request.workflow_id,
        event_type=request.event_type,
        has_filter=bool(request.filter_conditions),
    )

    return EventSubscriptionResponse(
        id=str(subscription.id),
        workflow_id=request.workflow_id,
        node_id=subscription.nodeId,
        event_type=subscription.eventType,
        filter_conditions=subscription.filterConditions,
        is_active=subscription.isActive,
        created_at=subscription.createdAt.isoformat(),
    )


@router.get("/event-subscriptions", response_model=EventSubscriptionListResponse)
async def list_event_subscriptions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    """
    List all event subscriptions for the current tenant.
    """
    # Query subscriptions through workflow JOIN to filter by tenant
    query = (
        select(WorkflowEventSubscription)
        .join(Workflow, WorkflowEventSubscription.workflowId == Workflow.id)
        .where(Workflow.tenantId == current_user.currentTenantId)
        .order_by(WorkflowEventSubscription.createdAt.desc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(query)
    subscriptions = result.scalars().all()

    # Get total count
    count_query = (
        select(func.count())
        .select_from(WorkflowEventSubscription)
        .join(Workflow, WorkflowEventSubscription.workflowId == Workflow.id)
        .where(Workflow.tenantId == current_user.currentTenantId)
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    logger.info(
        "event_subscriptions_list_requested",
        user_id=current_user.id,
        tenant_id=current_user.currentTenantId,
        count=len(subscriptions),
    )

    return EventSubscriptionListResponse(
        items=[
            EventSubscriptionResponse(
                id=str(sub.id),
                workflow_id=str(sub.workflowId),
                node_id=sub.nodeId,
                event_type=sub.eventType,
                filter_conditions=sub.filterConditions,
                is_active=sub.isActive,
                created_at=sub.createdAt.isoformat(),
            )
            for sub in subscriptions
        ],
        total=total,
    )


@router.delete("/event-subscriptions/{subscription_id}")
async def delete_event_subscription(
    subscription_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete an event subscription.
    """
    # Query subscription through workflow JOIN to ensure tenant isolation
    query = (
        select(WorkflowEventSubscription)
        .join(Workflow, WorkflowEventSubscription.workflowId == Workflow.id)
        .where(
            WorkflowEventSubscription.id == int(subscription_id),
            Workflow.tenantId == current_user.currentTenantId,
        )
    )

    result = await db.execute(query)
    subscription = result.scalar_one_or_none()

    if not subscription:
        raise HTTPException(
            status_code=404,
            detail=f"Subscription {subscription_id} not found or access denied",
        )

    await db.delete(subscription)
    await db.commit()

    logger.info(
        "event_subscription_deleted",
        subscription_id=subscription_id,
        user_id=current_user.id,
    )

    return {"status": "deleted", "subscription_id": subscription_id}


# ============================================================================
# Workflow to Skill Conversion Endpoints
# ============================================================================


@router.get("/{workflow_id}/analyze-conversion")
async def analyze_workflow_conversion(
    workflow_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Analyze workflow for conversion to agent skill.
    Returns compatibility score and required adapters.
    """
    from app.conversion.analyzer import ConversionAnalyzer

    # Fetch workflow
    workflow = await db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Check access
    if workflow.created_by != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    # Analyze workflow
    analyzer = ConversionAnalyzer()
    analysis = analyzer.analyze({
        "id": workflow.id,
        "nodes": workflow.workflow_json.get("nodes", []),
        "edges": workflow.workflow_json.get("edges", []),
    })

    return {
        "eligible": analysis.eligible,
        "compatibility_score": analysis.compatibility_score,
        "level": analysis.level.value,
        "unsupported_nodes": [
            {
                "node_id": n.node_id,
                "node_type": n.node_type,
                "reason": n.reason,
            }
            for n in analysis.unsupported_nodes
        ],
        "adapters_required": [
            {
                "node_id": n.node_id,
                "node_type": n.node_type,
                "adapter": n.adapter_required,
            }
            for n in analysis.adapters_required
        ],
        "recommendations": analysis.recommendations,
    }


class ConvertToSkillRequest(BaseModel):
    """Request to convert workflow to skill."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    trigger_patterns: list[str] = Field(default_factory=list)
    is_enabled: bool = Field(default=False)


@router.post("/{workflow_id}/convert-to-skill")
async def convert_workflow_to_skill(
    workflow_id: int,
    request: ConvertToSkillRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Convert a workflow to an agent skill.
    """
    from app.conversion.analyzer import ConversionAnalyzer
    from app.conversion.adapter_registry import AdapterRegistry
    from datetime import timezone

    # Fetch workflow
    workflow = await db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Check access
    if workflow.created_by != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Access denied")

    # Analyze workflow
    analyzer = ConversionAnalyzer()
    analysis = analyzer.analyze({
        "id": workflow.id,
        "nodes": workflow.workflow_json.get("nodes", []),
        "edges": workflow.workflow_json.get("edges", []),
    })

    if not analysis.eligible:
        raise HTTPException(
            status_code=400,
            detail=f"Workflow not eligible for conversion: {analysis.recommendations[0] if analysis.recommendations else 'Unknown reason'}"
        )

    # Adapt nodes
    original_nodes = workflow.workflow_json.get("nodes", [])
    adapted_nodes = [AdapterRegistry.adapt_node(node) for node in original_nodes]

    # Create skill (simplified - in production, integrate with skill system)
    import secrets
    skill_id = f"skill_{secrets.token_hex(8)}"
    
    # Prepare conversion metadata
    conversion_metadata = {
        "original_workflow_id": workflow_id,
        "converted_by": current_user.id,
        "converted_at": datetime.now(timezone.utc).isoformat(),
        "compatibility_score": analysis.compatibility_score,
        "adapters_used": [a.adapter_required for a in analysis.adapters_required],
    }

    logger.info(
        "workflow_converted_to_skill",
        workflow_id=workflow_id,
        skill_id=skill_id,
        user_id=current_user.id,
        name=request.name,
    )

    return {
        "skill_id": skill_id,
        "name": request.name,
        "status": "created",
        "trigger_patterns": request.trigger_patterns,
        "is_enabled": request.is_enabled,
        "conversion_metadata": conversion_metadata,
        "note": "Skill created successfully. Integration with skill registry required for full functionality.",
    }


# ============================================================================
# Skills Endpoint (for skill node)
# ============================================================================


@router.get("/skills")
async def get_available_skills(
    current_user: User = Depends(get_current_user),
):
    """
    Get list of available skills for skill nodes.
    """
    skills = discover_available_skills()
    return {
        "skills": [
            {
                "id": skill["id"],
                "name": skill["name"],
                "description": skill.get("description", ""),
                "category": skill.get("category", "general"),
                "version": skill.get("version", "1.0.0"),
                "source": skill.get("source", "unknown"),
            }
            for skill in skills
        ]
    }
