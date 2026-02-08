"""Workflow API endpoints."""
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.models.user import User
from app.orchestrator.flow_compiler import CompilationError, FlowCompiler

router = APIRouter()
logger = structlog.get_logger(__name__)


class FlowCompileRequest(BaseModel):
    """Request to compile ReactFlow JSON to workflow manifest."""

    nodes: list[dict[str, Any]] = Field(..., description="ReactFlow nodes")
    edges: list[dict[str, Any]] = Field(..., description="ReactFlow edges")
    metadata: dict[str, Any] | None = Field(default=None, description="Manifest metadata")


class FlowCompileResponse(BaseModel):
    """Response from flow compilation."""

    success: bool
    manifest: dict[str, Any] | None = None
    error: str | None = None


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
        compiler = FlowCompiler()
        manifest = compiler.compile(flow_json, metadata=metadata)

        logger.info(
            "flow_compiled_successfully",
            user_id=current_user.id,
            node_count=len(manifest["nodes"]),
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
        )
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected compilation error: {str(e)}",
        ) from e


@router.get("/")
async def list_workflows(
    current_user: User = Depends(get_current_user),
):
    """List user's workflows (placeholder for future implementation)."""
    return {"workflows": [], "note": "List workflows - to be implemented in Phase 2"}


@router.post("/execute")
async def execute_workflow(
    current_user: User = Depends(get_current_user),
):
    """Execute a workflow (placeholder for future implementation)."""
    return {"status": "not_implemented", "note": "Execute workflow - to be implemented in Phase 2"}


@router.get("/{workflow_id}/report")
async def get_workflow_report(
    workflow_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get workflow execution report (placeholder for future implementation)."""
    return {
        "workflow_id": workflow_id,
        "status": "not_implemented",
        "note": "Workflow report - to be implemented in Phase 2",
    }
