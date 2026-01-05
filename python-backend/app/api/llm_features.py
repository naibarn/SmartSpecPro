"""
LLM Features API
Prompt Templates and Model Comparison
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

from app.core.auth import get_current_user
from app.core.database import get_db
from app.services.prompt_template_service import PromptTemplateService
from app.services.model_comparison_service import ModelComparisonService


router = APIRouter(prefix="/api/v1/llm")


# ============================================================================
# Request/Response Models
# ============================================================================

class CreateTemplateRequest(BaseModel):
    """Create template request"""
    name: str = Field(..., min_length=1, max_length=255)
    template: str = Field(..., min_length=1)
    description: Optional[str] = None
    category: Optional[str] = None
    is_public: bool = False


class UpdateTemplateRequest(BaseModel):
    """Update template request"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    template: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    category: Optional[str] = None
    is_public: Optional[bool] = None
    is_favorite: Optional[bool] = None


class RenderTemplateRequest(BaseModel):
    """Render template request"""
    variables: Dict[str, str]


class CreateVersionRequest(BaseModel):
    """Create template version request"""
    template: str = Field(..., min_length=1)
    description: Optional[str] = None


class ModelConfig(BaseModel):
    """Model configuration"""
    provider: str = Field(..., min_length=1)
    model: str = Field(..., min_length=1)


class CompareModelsRequest(BaseModel):
    """Compare models request"""
    prompt: str = Field(..., min_length=1)
    models: List[ModelConfig] = Field(..., min_items=2, max_items=5)
    max_tokens: int = Field(1000, ge=1, le=4000)
    temperature: float = Field(0.7, ge=0.0, le=2.0)


# ============================================================================
# Prompt Templates Endpoints
# ============================================================================

@router.post("/templates", status_code=status.HTTP_201_CREATED)
async def create_template(
    request: CreateTemplateRequest,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Create a new prompt template
    
    Template variables are defined using {{variable_name}} syntax.
    """
    service = PromptTemplateService(db)
    
    template = await service.create_template(
        user_id=current_user["id"],
        name=request.name,
        template=request.template,
        description=request.description,
        category=request.category,
        is_public=request.is_public
    )
    
    return template


@router.get("/templates/{template_id}")
async def get_template(
    template_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Get a template by ID"""
    service = PromptTemplateService(db)
    
    template = await service.get_template(template_id, current_user["id"])
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    return template


@router.get("/templates")
async def list_templates(
    category: Optional[str] = None,
    is_public: Optional[bool] = None,
    is_favorite: Optional[bool] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """List user's templates"""
    service = PromptTemplateService(db)
    
    templates = await service.list_templates(
        user_id=current_user["id"],
        category=category,
        is_public=is_public,
        is_favorite=is_favorite,
        limit=limit,
        offset=offset
    )
    
    return {
        "templates": templates,
        "total": len(templates),
        "limit": limit,
        "offset": offset
    }


@router.put("/templates/{template_id}")
async def update_template(
    template_id: str,
    request: UpdateTemplateRequest,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Update a template"""
    service = PromptTemplateService(db)
    
    template = await service.update_template(
        template_id=template_id,
        user_id=current_user["id"],
        name=request.name,
        template=request.template,
        description=request.description,
        category=request.category,
        is_public=request.is_public,
        is_favorite=request.is_favorite
    )
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found or not owned by user"
        )
    
    return template


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Delete a template"""
    service = PromptTemplateService(db)
    
    deleted = await service.delete_template(template_id, current_user["id"])
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found or not owned by user"
        )
    
    return None


@router.post("/templates/{template_id}/render")
async def render_template(
    template_id: str,
    request: RenderTemplateRequest,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Render a template with variables
    
    Returns the rendered prompt string.
    """
    service = PromptTemplateService(db)
    
    rendered = await service.render_template(
        template_id=template_id,
        user_id=current_user["id"],
        variables=request.variables
    )
    
    if not rendered:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    return {
        "template_id": template_id,
        "rendered": rendered
    }


@router.post("/templates/{template_id}/versions", status_code=status.HTTP_201_CREATED)
async def create_version(
    template_id: str,
    request: CreateVersionRequest,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Create a new version of a template"""
    service = PromptTemplateService(db)
    
    version = await service.create_version(
        template_id=template_id,
        user_id=current_user["id"],
        template=request.template,
        description=request.description
    )
    
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found or not owned by user"
        )
    
    return version


@router.get("/templates/{template_id}/versions")
async def get_versions(
    template_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Get all versions of a template"""
    service = PromptTemplateService(db)
    
    versions = await service.get_versions(template_id, current_user["id"])
    
    return {
        "template_id": template_id,
        "versions": versions,
        "total": len(versions)
    }


# ============================================================================
# Model Comparison Endpoints
# ============================================================================

@router.post("/compare", status_code=status.HTTP_201_CREATED)
async def compare_models(
    request: CompareModelsRequest,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Compare multiple models with the same prompt
    
    Runs the same prompt on 2-5 different models and returns
    side-by-side results with cost and performance metrics.
    """
    service = ModelComparisonService(db)
    
    try:
        models = [{"provider": m.provider, "model": m.model} for m in request.models]
        
        comparison = await service.compare_models(
            user_id=current_user["id"],
            prompt=request.prompt,
            models=models,
            max_tokens=request.max_tokens,
            temperature=request.temperature
        )
        
        return comparison
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Comparison failed: {str(e)}"
        )


@router.get("/comparisons/{comparison_id}")
async def get_comparison(
    comparison_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Get a comparison by ID"""
    service = ModelComparisonService(db)
    
    comparison = await service.get_comparison(comparison_id, current_user["id"])
    
    if not comparison:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comparison not found"
        )
    
    return comparison


@router.get("/comparisons")
async def list_comparisons(
    limit: int = 20,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """List user's comparisons"""
    service = ModelComparisonService(db)
    
    comparisons = await service.list_comparisons(
        user_id=current_user["id"],
        limit=limit,
        offset=offset
    )
    
    return {
        "comparisons": comparisons,
        "total": len(comparisons),
        "limit": limit,
        "offset": offset
    }


@router.delete("/comparisons/{comparison_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comparison(
    comparison_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_db)
):
    """Delete a comparison"""
    service = ModelComparisonService(db)
    
    deleted = await service.delete_comparison(comparison_id, current_user["id"])
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comparison not found or not owned by user"
        )
    
    return None
