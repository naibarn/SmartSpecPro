"""
Skill Management API endpoints.

This module provides REST API endpoints for managing Kilo Code skills,
including CRUD operations, template management, and skill injection.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel, Field
import structlog

from app.services.kilo_skill_manager import (
    KiloSkillManager,
    Skill,
    SkillScope,
    SkillMode,
    SKILL_TEMPLATES,
    get_kilo_skill_manager,
)

logger = structlog.get_logger()
router = APIRouter(prefix="/skills", tags=["skills"])


# ============================================================================
# Request/Response Models
# ============================================================================

class SkillCreate(BaseModel):
    """Request model for creating a skill."""
    name: str = Field(..., description="Unique skill name (kebab-case)")
    description: str = Field(..., description="Brief description of the skill")
    content: str = Field(..., description="Skill content in Markdown format")
    scope: SkillScope = Field(default=SkillScope.PROJECT, description="Skill scope")
    mode: SkillMode = Field(default=SkillMode.GENERIC, description="Kilo mode")
    tags: List[str] = Field(default_factory=list, description="Tags for categorization")


class SkillUpdate(BaseModel):
    """Request model for updating a skill."""
    description: Optional[str] = Field(None, description="Brief description")
    content: Optional[str] = Field(None, description="Skill content in Markdown")
    scope: Optional[SkillScope] = Field(None, description="Skill scope")
    mode: Optional[SkillMode] = Field(None, description="Kilo mode")
    tags: Optional[List[str]] = Field(None, description="Tags for categorization")


class SkillResponse(BaseModel):
    """Response model for a skill."""
    name: str
    description: str
    content: str
    scope: str
    mode: str
    tags: List[str]
    file_path: Optional[str] = None
    
    class Config:
        from_attributes = True


class SkillListResponse(BaseModel):
    """Response model for listing skills."""
    skills: List[SkillResponse]
    total: int


class TemplateInfo(BaseModel):
    """Information about a skill template."""
    name: str
    description: str
    mode: str
    tags: List[str]
    preview: str  # First 500 chars of content


class TemplateListResponse(BaseModel):
    """Response model for listing templates."""
    templates: List[TemplateInfo]
    total: int


class InjectTemplateRequest(BaseModel):
    """Request model for injecting a template."""
    template_name: str = Field(..., description="Name of the template to inject")
    variables: dict = Field(default_factory=dict, description="Variables to substitute")


class InjectContextRequest(BaseModel):
    """Request model for injecting SmartSpec context."""
    user_id: Optional[str] = Field(None, description="User ID for preferences")
    project_id: Optional[str] = Field(None, description="Project ID for facts")
    include_episodic: bool = Field(default=True, description="Include episodic memories")


class SkillInjectionResponse(BaseModel):
    """Response model for skill injection."""
    success: bool
    skill_path: str
    message: str


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("", response_model=SkillListResponse)
async def list_skills(
    workspace: str = Query(..., description="Path to workspace directory"),
    mode: Optional[str] = Query(None, description="Filter by mode"),
    scope: Optional[str] = Query(None, description="Filter by scope"),
):
    """
    List all skills in a workspace.
    
    Returns all skills found in the .kilocode/skills directory,
    optionally filtered by mode or scope.
    """
    try:
        manager = get_kilo_skill_manager()
        
        # Get skills directory
        mode_filter = SkillMode(mode) if mode else None
        skills = await manager.list_skills(workspace, mode=mode_filter)
        
        # Filter by scope if specified
        if scope:
            scope_filter = SkillScope(scope)
            skills = [s for s in skills if s.scope == scope_filter]
        
        return SkillListResponse(
            skills=[
                SkillResponse(
                    name=s.name,
                    description=s.description,
                    content=s.content,
                    scope=s.scope.value,
                    mode=s.mode.value,
                    tags=s.tags,
                    file_path=s.file_path,
                )
                for s in skills
            ],
            total=len(skills),
        )
    except Exception as e:
        logger.error("Failed to list skills", error=str(e), workspace=workspace)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/templates", response_model=TemplateListResponse)
async def list_templates():
    """
    List all available skill templates.
    
    Returns built-in templates that can be injected into projects.
    """
    templates = []
    for name, template in SKILL_TEMPLATES.items():
        # template is a Skill object, not a dict
        content = template.content if hasattr(template, 'content') else ""
        preview = content[:500] + "..." if len(content) > 500 else content
        
        templates.append(TemplateInfo(
            name=name,
            description=template.description if hasattr(template, 'description') else "",
            mode=template.mode.value if hasattr(template, 'mode') else "generic",
            tags=template.tags if hasattr(template, 'tags') else [],
            preview=preview,
        ))
    
    return TemplateListResponse(
        templates=templates,
        total=len(templates),
    )


@router.get("/templates/{template_name}")
async def get_template(
    template_name: str = Path(..., description="Template name"),
):
    """
    Get a specific skill template.
    
    Returns the full content and metadata of a template.
    """
    if template_name not in SKILL_TEMPLATES:
        raise HTTPException(status_code=404, detail=f"Template '{template_name}' not found")
    
    template = SKILL_TEMPLATES[template_name]
    return {
        "name": template_name,
        "description": template.description if hasattr(template, 'description') else "",
        "content": template.content if hasattr(template, 'content') else "",
        "mode": template.mode.value if hasattr(template, 'mode') else "generic",
        "tags": template.tags if hasattr(template, 'tags') else [],
    }


@router.get("/{skill_name}", response_model=SkillResponse)
async def get_skill(
    skill_name: str = Path(..., description="Skill name"),
    workspace: str = Query(..., description="Path to workspace directory"),
    mode: Optional[str] = Query(None, description="Kilo mode"),
):
    """
    Get a specific skill by name.
    
    Returns the skill content and metadata.
    """
    try:
        manager = get_kilo_skill_manager()
        mode_enum = SkillMode(mode) if mode else None
        
        skill = await manager.get_skill(workspace, skill_name, mode=mode_enum)
        
        if not skill:
            raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")
        
        return SkillResponse(
            name=skill.name,
            description=skill.description,
            content=skill.content,
            scope=skill.scope.value,
            mode=skill.mode.value,
            tags=skill.tags,
            file_path=skill.file_path,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get skill", error=str(e), skill_name=skill_name)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=SkillResponse)
async def create_skill(
    skill: SkillCreate,
    workspace: str = Query(..., description="Path to workspace directory"),
):
    """
    Create a new skill.
    
    Creates a new SKILL.md file in the appropriate directory.
    """
    try:
        manager = get_kilo_skill_manager()
        
        # Create skill object
        new_skill = Skill(
            name=skill.name,
            description=skill.description,
            content=skill.content,
            scope=skill.scope,
            mode=skill.mode,
            tags=skill.tags,
        )
        
        # Save skill
        file_path = await manager.create_skill(workspace, new_skill)
        
        logger.info(
            "Skill created",
            skill_name=skill.name,
            workspace=workspace,
            file_path=file_path,
        )
        
        return SkillResponse(
            name=new_skill.name,
            description=new_skill.description,
            content=new_skill.content,
            scope=new_skill.scope.value,
            mode=new_skill.mode.value,
            tags=new_skill.tags,
            file_path=file_path,
        )
    except Exception as e:
        logger.error("Failed to create skill", error=str(e), skill_name=skill.name)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{skill_name}", response_model=SkillResponse)
async def update_skill(
    skill_name: str = Path(..., description="Skill name"),
    skill_update: SkillUpdate = ...,
    workspace: str = Query(..., description="Path to workspace directory"),
    mode: Optional[str] = Query(None, description="Kilo mode"),
):
    """
    Update an existing skill.
    
    Updates the SKILL.md file with new content.
    """
    try:
        manager = get_kilo_skill_manager()
        mode_enum = SkillMode(mode) if mode else None
        
        # Get existing skill
        existing = await manager.get_skill(workspace, skill_name, mode=mode_enum)
        if not existing:
            raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")
        
        # Update fields
        if skill_update.description is not None:
            existing.description = skill_update.description
        if skill_update.content is not None:
            existing.content = skill_update.content
        if skill_update.scope is not None:
            existing.scope = skill_update.scope
        if skill_update.mode is not None:
            existing.mode = skill_update.mode
        if skill_update.tags is not None:
            existing.tags = skill_update.tags
        
        # Save updated skill
        file_path = await manager.update_skill(workspace, existing)
        
        logger.info(
            "Skill updated",
            skill_name=skill_name,
            workspace=workspace,
        )
        
        return SkillResponse(
            name=existing.name,
            description=existing.description,
            content=existing.content,
            scope=existing.scope.value,
            mode=existing.mode.value,
            tags=existing.tags,
            file_path=file_path,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update skill", error=str(e), skill_name=skill_name)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{skill_name}")
async def delete_skill(
    skill_name: str = Path(..., description="Skill name"),
    workspace: str = Query(..., description="Path to workspace directory"),
    mode: Optional[str] = Query(None, description="Kilo mode"),
):
    """
    Delete a skill.
    
    Removes the skill directory and SKILL.md file.
    """
    try:
        manager = get_kilo_skill_manager()
        mode_enum = SkillMode(mode) if mode else None
        
        success = await manager.delete_skill(workspace, skill_name, mode=mode_enum)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")
        
        logger.info(
            "Skill deleted",
            skill_name=skill_name,
            workspace=workspace,
        )
        
        return {"success": True, "message": f"Skill '{skill_name}' deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete skill", error=str(e), skill_name=skill_name)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/inject/template", response_model=SkillInjectionResponse)
async def inject_template(
    request: InjectTemplateRequest,
    workspace: str = Query(..., description="Path to workspace directory"),
):
    """
    Inject a skill template into the workspace.
    
    Creates a new skill from a template with optional variable substitution.
    """
    try:
        manager = get_kilo_skill_manager()
        
        if request.template_name not in SKILL_TEMPLATES:
            raise HTTPException(
                status_code=404,
                detail=f"Template '{request.template_name}' not found"
            )
        
        skill_path = await manager.inject_template(
            workspace=workspace,
            template_name=request.template_name,
            variables=request.variables,
        )
        
        logger.info(
            "Template injected",
            template_name=request.template_name,
            workspace=workspace,
            skill_path=skill_path,
        )
        
        return SkillInjectionResponse(
            success=True,
            skill_path=skill_path,
            message=f"Template '{request.template_name}' injected successfully",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Failed to inject template",
            error=str(e),
            template_name=request.template_name,
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/inject/context", response_model=SkillInjectionResponse)
async def inject_smartspec_context(
    request: InjectContextRequest,
    workspace: str = Query(..., description="Path to workspace directory"),
):
    """
    Inject SmartSpec context as a skill.
    
    Creates a skill from user preferences, project facts, and memories.
    """
    try:
        manager = get_kilo_skill_manager()
        
        skill_path = await manager.inject_smartspec_context(
            workspace=workspace,
            user_id=request.user_id,
            project_id=request.project_id,
            include_episodic=request.include_episodic,
        )
        
        logger.info(
            "SmartSpec context injected",
            workspace=workspace,
            user_id=request.user_id,
            project_id=request.project_id,
        )
        
        return SkillInjectionResponse(
            success=True,
            skill_path=skill_path,
            message="SmartSpec context injected successfully",
        )
    except Exception as e:
        logger.error(
            "Failed to inject SmartSpec context",
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/setup-project")
async def setup_project_skills(
    workspace: str = Query(..., description="Path to workspace directory"),
    templates: List[str] = Query(
        default=["project_conventions", "api_design", "security_practices"],
        description="List of templates to inject",
    ),
):
    """
    Setup default project skills.
    
    Injects a set of recommended skill templates for a new project.
    """
    try:
        manager = get_kilo_skill_manager()
        
        results = []
        for template_name in templates:
            if template_name in SKILL_TEMPLATES:
                try:
                    skill_path = await manager.inject_template(
                        workspace=workspace,
                        template_name=template_name,
                    )
                    results.append({
                        "template": template_name,
                        "success": True,
                        "path": skill_path,
                    })
                except Exception as e:
                    results.append({
                        "template": template_name,
                        "success": False,
                        "error": str(e),
                    })
            else:
                results.append({
                    "template": template_name,
                    "success": False,
                    "error": "Template not found",
                })
        
        success_count = sum(1 for r in results if r["success"])
        
        logger.info(
            "Project skills setup",
            workspace=workspace,
            success_count=success_count,
            total=len(templates),
        )
        
        return {
            "success": success_count == len(templates),
            "results": results,
            "message": f"Setup {success_count}/{len(templates)} skills",
        }
    except Exception as e:
        logger.error("Failed to setup project skills", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Sync Endpoints (Claude Code Compatibility)
# ============================================================================

class SyncRequest(BaseModel):
    """Request model for syncing skills."""
    source_format: str = Field(default="kilo", description="Source format (kilo or claude)")
    bidirectional: bool = Field(default=False, description="Sync in both directions")


class SyncResponse(BaseModel):
    """Response model for sync operations."""
    success: bool
    synced_count: int
    failed_count: int
    results: dict
    message: str


class DiffResponse(BaseModel):
    """Response model for diff operations."""
    synced: List[str]
    only_kilo: List[str]
    only_claude: List[str]
    total_kilo: int
    total_claude: int


@router.post("/sync", response_model=SyncResponse)
async def sync_skills(
    request: SyncRequest,
    workspace: str = Query(..., description="Path to workspace directory"),
):
    """
    Sync skills between Kilo Code and Claude Code directories.
    
    Converts and copies skills from one format to another.
    """
    try:
        from app.services.kilo_skill_manager_v2 import SkillConverter, SkillFormat
        
        converter = SkillConverter()
        source_format = SkillFormat.KILO if request.source_format == "kilo" else SkillFormat.CLAUDE
        
        results = converter.sync_directory(
            workspace,
            source_format=source_format,
            bidirectional=request.bidirectional,
        )
        
        synced = len([r for r in results.values() if r])
        failed = len([r for r in results.values() if not r])
        
        logger.info(
            "Skills synced",
            workspace=workspace,
            synced=synced,
            failed=failed,
        )
        
        return SyncResponse(
            success=failed == 0,
            synced_count=synced,
            failed_count=failed,
            results=results,
            message=f"Synced {synced} skills" + (f", {failed} failed" if failed else ""),
        )
    except Exception as e:
        logger.error("Failed to sync skills", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/diff", response_model=DiffResponse)
async def diff_skills(
    workspace: str = Query(..., description="Path to workspace directory"),
):
    """
    Show differences between Kilo Code and Claude Code skill directories.
    
    Returns lists of skills that exist in one directory but not the other.
    """
    try:
        from pathlib import Path
        
        kilo_dir = Path(workspace) / ".kilocode" / "skills"
        claude_dir = Path(workspace) / ".claude" / "skills"
        
        kilo_skills = set()
        claude_skills = set()
        
        if kilo_dir.exists():
            for skill_dir in kilo_dir.iterdir():
                if skill_dir.is_dir() and (skill_dir / "SKILL.md").exists():
                    kilo_skills.add(skill_dir.name)
        
        if claude_dir.exists():
            for skill_dir in claude_dir.iterdir():
                if skill_dir.is_dir() and (skill_dir / "SKILL.md").exists():
                    claude_skills.add(skill_dir.name)
        
        return DiffResponse(
            synced=sorted(list(kilo_skills & claude_skills)),
            only_kilo=sorted(list(kilo_skills - claude_skills)),
            only_claude=sorted(list(claude_skills - kilo_skills)),
            total_kilo=len(kilo_skills),
            total_claude=len(claude_skills),
        )
    except Exception as e:
        logger.error("Failed to diff skills", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/convert")
async def convert_skill(
    skill_name: str = Query(..., description="Skill name to convert"),
    workspace: str = Query(..., description="Path to workspace directory"),
    source_format: str = Query(default="kilo", description="Source format"),
    target_format: str = Query(default="claude", description="Target format"),
):
    """
    Convert a single skill from one format to another.
    
    Creates a copy of the skill in the target format's directory.
    """
    try:
        from app.services.kilo_skill_manager_v2 import KiloSkillManager, SkillFormat
        
        manager = KiloSkillManager()
        
        src_fmt = SkillFormat.KILO if source_format == "kilo" else SkillFormat.CLAUDE
        tgt_fmt = SkillFormat.KILO if target_format == "kilo" else SkillFormat.CLAUDE
        
        # Get skill from source
        skill = manager.get_skill(workspace, skill_name, prefer_format=src_fmt)
        
        if not skill:
            raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")
        
        # Create in target format
        result = manager.create_skill(workspace, skill, formats=[tgt_fmt])
        
        if tgt_fmt in result:
            return {
                "success": True,
                "skill_name": skill_name,
                "source_format": source_format,
                "target_format": target_format,
                "target_path": str(result[tgt_fmt]),
                "message": f"Skill converted from {source_format} to {target_format}",
            }
        else:
            raise HTTPException(status_code=500, detail="Conversion failed")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to convert skill", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
