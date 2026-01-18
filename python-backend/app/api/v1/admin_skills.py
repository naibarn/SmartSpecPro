"""
Admin Skills API endpoints for SmartSpecWeb
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

from app.auth import get_current_admin_user
from app.services.kilo_skill_manager_v2 import (
    KiloSkillManager,
    Skill,
    SkillScope,
    SkillMode,
    SkillFormat,
)

router = APIRouter(prefix="/admin/skills", tags=["Admin - Skills"])

# Initialize skill manager
skill_manager = KiloSkillManager()


# ==================== Request/Response Models ====================

class SkillCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    description: str = Field(..., min_length=1, max_length=1024)
    content: str = Field(..., min_length=1)
    scope: str = Field(default="project")
    mode: str = Field(default="generic")
    tags: List[str] = Field(default_factory=list)
    version: Optional[str] = Field(default="1.0.0")
    author: Optional[str] = None
    allowed_tools: List[str] = Field(default_factory=list)
    model: Optional[str] = None


class SkillUpdateRequest(BaseModel):
    description: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[List[str]] = None
    version: Optional[str] = None
    author: Optional[str] = None


class SkillResponse(BaseModel):
    id: str
    name: str
    description: str
    content: str
    scope: str
    mode: str
    version: str
    author: Optional[str]
    tags: List[str]
    allowed_tools: List[str]
    model: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str


# ==================== Endpoints ====================

@router.get("", response_model=List[SkillResponse])
async def list_skills(
    scope: Optional[str] = None,
    mode: Optional[str] = None,
    _current_user=Depends(get_current_admin_user),
):
    """
    List all global skills (admin only)
    """
    try:
        # Get global skills
        skills = skill_manager.list_skills(
            workspace="/",  # Global scope
            scope=SkillScope.GLOBAL if not scope else SkillScope(scope),
            mode=SkillMode(mode) if mode else None,
        )

        # Convert to response format
        return [
            SkillResponse(
                id=skill.name,  # Use name as ID for now
                name=skill.name,
                description=skill.description,
                content=skill.content,
                scope=skill.scope.value,
                mode=skill.mode.value,
                version=skill.version,
                author=skill.author,
                tags=skill.tags,
                allowed_tools=skill.allowed_tools,
                model=skill.model,
                is_active=True,  # All listed skills are active
                created_at=skill.created_at.isoformat(),
                updated_at=skill.updated_at.isoformat(),
            )
            for skill in skills
        ]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list skills: {str(e)}",
        )


@router.post("", response_model=SkillResponse)
async def create_skill(
    skill_data: SkillCreateRequest,
    _current_user=Depends(get_current_admin_user),
):
    """
    Create a new global skill (admin only)
    """
    try:
        # Create skill
        skill = Skill(
            name=skill_data.name,
            description=skill_data.description,
            content=skill_data.content,
            scope=SkillScope(skill_data.scope),
            mode=SkillMode(skill_data.mode),
            version=skill_data.version or "1.0.0",
            author=skill_data.author,
            tags=skill_data.tags,
            allowed_tools=skill_data.allowed_tools,
            model=skill_data.model,
        )

        # Save to global directory
        skill_manager.create_skill(
            workspace="/",
            skill=skill,
        )

        return SkillResponse(
            id=skill.name,
            name=skill.name,
            description=skill.description,
            content=skill.content,
            scope=skill.scope.value,
            mode=skill.mode.value,
            version=skill.version,
            author=skill.author,
            tags=skill.tags,
            allowed_tools=skill.allowed_tools,
            model=skill.model,
            is_active=True,
            created_at=skill.created_at.isoformat(),
            updated_at=skill.updated_at.isoformat(),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create skill: {str(e)}",
        )


@router.get("/{skill_id}", response_model=SkillResponse)
async def get_skill(
    skill_id: str,
    _current_user=Depends(get_current_admin_user),
):
    """
    Get a specific skill by ID (admin only)
    """
    try:
        skill = skill_manager.get_skill(
            workspace="/",
            skill_name=skill_id,
            scope=SkillScope.GLOBAL,
        )

        if not skill:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Skill '{skill_id}' not found",
            )

        return SkillResponse(
            id=skill.name,
            name=skill.name,
            description=skill.description,
            content=skill.content,
            scope=skill.scope.value,
            mode=skill.mode.value,
            version=skill.version,
            author=skill.author,
            tags=skill.tags,
            allowed_tools=skill.allowed_tools,
            model=skill.model,
            is_active=True,
            created_at=skill.created_at.isoformat(),
            updated_at=skill.updated_at.isoformat(),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get skill: {str(e)}",
        )


@router.put("/{skill_id}", response_model=SkillResponse)
async def update_skill(
    skill_id: str,
    skill_data: SkillUpdateRequest,
    _current_user=Depends(get_current_admin_user),
):
    """
    Update an existing skill (admin only)
    """
    try:
        # Get existing skill
        skill = skill_manager.get_skill(
            workspace="/",
            skill_name=skill_id,
            scope=SkillScope.GLOBAL,
        )

        if not skill:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Skill '{skill_id}' not found",
            )

        # Update fields
        if skill_data.description is not None:
            skill.description = skill_data.description
        if skill_data.content is not None:
            skill.content = skill_data.content
        if skill_data.tags is not None:
            skill.tags = skill_data.tags
        if skill_data.version is not None:
            skill.version = skill_data.version
        if skill_data.author is not None:
            skill.author = skill_data.author

        skill.updated_at = datetime.utcnow()

        # Save updated skill
        skill_manager.update_skill(
            workspace="/",
            skill_name=skill_id,
            skill=skill,
        )

        return SkillResponse(
            id=skill.name,
            name=skill.name,
            description=skill.description,
            content=skill.content,
            scope=skill.scope.value,
            mode=skill.mode.value,
            version=skill.version,
            author=skill.author,
            tags=skill.tags,
            allowed_tools=skill.allowed_tools,
            model=skill.model,
            is_active=True,
            created_at=skill.created_at.isoformat(),
            updated_at=skill.updated_at.isoformat(),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to update skill: {str(e)}",
        )


@router.delete("/{skill_id}")
async def delete_skill(
    skill_id: str,
    _current_user=Depends(get_current_admin_user),
):
    """
    Delete a skill (admin only)
    """
    try:
        skill_manager.delete_skill(
            workspace="/",
            skill_name=skill_id,
            scope=SkillScope.GLOBAL,
        )

        return {"success": True, "message": f"Skill '{skill_id}' deleted successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete skill: {str(e)}",
        )
