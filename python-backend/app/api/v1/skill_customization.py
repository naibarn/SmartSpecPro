"""
Skill Customization API
Allows users to customize skill system prompts
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional, Dict
import structlog

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.services.skill_prompt_service import SkillPromptService

logger = structlog.get_logger()
router = APIRouter()


# ==================== Request/Response Models ====================

class CustomPromptRequest(BaseModel):
    """Request to save custom prompt"""
    custom_system_prompt: str
    template_variables: Optional[Dict] = None
    is_active: bool = True


class CustomPromptResponse(BaseModel):
    """Response with custom prompt"""
    id: str
    user_id: int
    skill_id: str
    custom_system_prompt: str
    template_variables: Optional[Dict] = None
    is_active: bool
    created_at: str
    updated_at: str


class SkillInfo(BaseModel):
    """Information about a customizable skill"""
    skill_id: str
    name: str
    category: str
    description: str
    default_prompt: str
    template_variables: List[str]


class SkillsListResponse(BaseModel):
    """List of customizable skills"""
    skills: List[SkillInfo]
    total: int


class TemplateInfo(BaseModel):
    """Prompt template information"""
    id: str
    skill_id: str
    name: str
    description: Optional[str]
    system_prompt: str
    template_variables: Optional[Dict] = None
    category: Optional[str]
    usage_count: int


class TemplatesListResponse(BaseModel):
    """List of templates"""
    templates: List[TemplateInfo]
    total: int


class ToggleActiveRequest(BaseModel):
    """Request to toggle active status"""
    is_active: bool


# ==================== Endpoints ====================

@router.get("/skills/customizable", response_model=SkillsListResponse)
async def list_customizable_skills(
    current_user: User = Depends(get_current_user)
):
    """
    Get list of skills that support customization.
    Shows default prompts and available template variables.
    """
    skills = SkillPromptService.get_available_skills()
    return SkillsListResponse(
        skills=[SkillInfo(**skill) for skill in skills],
        total=len(skills)
    )


@router.get("/skills/{skill_id}/custom-prompt", response_model=Optional[CustomPromptResponse])
async def get_custom_prompt(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get user's custom prompt for a specific skill.
    Returns None if no custom prompt exists (using default).
    """
    custom = await SkillPromptService.get_custom_prompt(db, current_user.id, skill_id)

    if not custom:
        return None

    return CustomPromptResponse(**custom.to_dict())


@router.put("/skills/{skill_id}/custom-prompt", response_model=CustomPromptResponse)
async def save_custom_prompt(
    skill_id: str,
    request: CustomPromptRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Save or update custom prompt for a skill.
    Validates prompt for safety and length.
    """
    try:
        custom = await SkillPromptService.save_custom_prompt(
            db,
            current_user.id,
            skill_id,
            request.custom_system_prompt,
            request.template_variables,
            request.is_active
        )

        return CustomPromptResponse(**custom.to_dict())

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error("save_custom_prompt_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save custom prompt: {str(e)}"
        )


@router.delete("/skills/{skill_id}/custom-prompt")
async def delete_custom_prompt(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete custom prompt and reset to default.
    """
    deleted = await SkillPromptService.delete_custom_prompt(db, current_user.id, skill_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No custom prompt found for skill {skill_id}"
        )

    return {
        "success": True,
        "message": f"Custom prompt for {skill_id} deleted. Using default prompt now."
    }


@router.patch("/skills/{skill_id}/custom-prompt/toggle", response_model=CustomPromptResponse)
async def toggle_custom_prompt(
    skill_id: str,
    request: ToggleActiveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Toggle custom prompt active/inactive without deleting it.
    Useful for temporarily switching between custom and default.
    """
    custom = await SkillPromptService.toggle_prompt_active(
        db,
        current_user.id,
        skill_id,
        request.is_active
    )

    if not custom:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No custom prompt found for skill {skill_id}"
        )

    return CustomPromptResponse(**custom.to_dict())


@router.get("/skills/custom-prompts", response_model=List[CustomPromptResponse])
async def list_user_custom_prompts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List all custom prompts for the current user.
    """
    customs = await SkillPromptService.list_user_custom_prompts(db, current_user.id)
    return [CustomPromptResponse(**c.to_dict()) for c in customs]


# ==================== Template Endpoints ====================

@router.get("/skills/{skill_id}/templates", response_model=TemplatesListResponse)
async def get_skill_templates(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get available prompt templates for a skill.
    Templates are pre-made prompts that users can apply.
    """
    templates = await SkillPromptService.get_templates_for_skill(db, skill_id)

    return TemplatesListResponse(
        templates=[TemplateInfo(**t.to_dict()) for t in templates],
        total=len(templates)
    )


@router.post("/skills/templates/{template_id}/apply", response_model=CustomPromptResponse)
async def apply_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Apply a template to user's custom prompt.
    This copies the template's prompt to the user's custom settings.
    """
    try:
        custom = await SkillPromptService.apply_template(db, current_user.id, template_id)
        return CustomPromptResponse(**custom.to_dict())

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        logger.error("apply_template_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to apply template: {str(e)}"
        )


@router.get("/skills/{skill_id}/effective-prompt")
async def get_effective_prompt(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get the effective prompt that will be used for this skill.
    Returns custom if exists and active, otherwise default.
    Useful for preview/debugging.
    """
    prompt = await SkillPromptService.get_effective_prompt(
        db,
        current_user.id,
        skill_id
    )

    # Check if it's custom or default
    custom = await SkillPromptService.get_custom_prompt(db, current_user.id, skill_id)
    is_custom = custom is not None and custom.is_active

    return {
        "skill_id": skill_id,
        "prompt": prompt,
        "is_custom": is_custom,
        "source": "custom" if is_custom else "default"
    }
