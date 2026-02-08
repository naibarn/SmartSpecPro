"""Workflow API endpoints."""
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.orchestrator.flow_compiler import CompilationError, FlowCompiler
from app.orchestrator.node_registry import NodeRegistry

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
