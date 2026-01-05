"""
SmartSpec Pro - Kilo Code Skill Manager
Phase 2.3

Manages skill injection for Kilo Code CLI.
Skills are markdown files that provide domain expertise and
repeatable workflows to the AI agent.
"""

import os
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional
import yaml

import structlog

logger = structlog.get_logger()


# ==================== ENUMS ====================

class SkillScope(str, Enum):
    """Skill scope - where the skill is available."""
    GLOBAL = "global"  # Available in all projects (~/.kilocode/skills/)
    PROJECT = "project"  # Project-specific (.kilocode/skills/)


class SkillMode(str, Enum):
    """Skill mode - when the skill is loaded."""
    GENERIC = "generic"  # Available in all modes
    CODE = "code"  # Only in code mode
    ARCHITECT = "architect"  # Only in architect mode
    DEBUG = "debug"  # Only in debug mode
    ASK = "ask"  # Only in ask mode
    ORCHESTRATOR = "orchestrator"  # Only in orchestrator mode


# ==================== DATA CLASSES ====================

@dataclass
class Skill:
    """Represents a Kilo Code skill."""
    name: str
    description: str
    content: str
    scope: SkillScope = SkillScope.PROJECT
    mode: SkillMode = SkillMode.GENERIC
    version: str = "1.0.0"
    author: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "content": self.content,
            "scope": self.scope.value,
            "mode": self.mode.value,
            "version": self.version,
            "author": self.author,
            "tags": self.tags,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
    
    def to_skill_md(self) -> str:
        """
        Convert to SKILL.md format.
        
        Returns:
            SKILL.md content with YAML frontmatter
        """
        frontmatter = {
            "name": self.name,
            "description": self.description,
            "version": self.version,
        }
        
        if self.author:
            frontmatter["author"] = self.author
        
        if self.tags:
            frontmatter["tags"] = self.tags
        
        yaml_str = yaml.dump(frontmatter, default_flow_style=False, allow_unicode=True)
        
        return f"---\n{yaml_str}---\n\n{self.content}"
    
    @classmethod
    def from_skill_md(cls, content: str, name: str, scope: SkillScope, mode: SkillMode) -> "Skill":
        """
        Parse a SKILL.md file.
        
        Args:
            content: SKILL.md content
            name: Skill name (from directory)
            scope: Skill scope
            mode: Skill mode
        
        Returns:
            Skill instance
        """
        # Parse YAML frontmatter
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                try:
                    frontmatter = yaml.safe_load(parts[1])
                    body = parts[2].strip()
                except yaml.YAMLError:
                    frontmatter = {}
                    body = content
            else:
                frontmatter = {}
                body = content
        else:
            frontmatter = {}
            body = content
        
        return cls(
            name=frontmatter.get("name", name),
            description=frontmatter.get("description", ""),
            content=body,
            scope=scope,
            mode=mode,
            version=frontmatter.get("version", "1.0.0"),
            author=frontmatter.get("author"),
            tags=frontmatter.get("tags", []),
        )


# ==================== SKILL TEMPLATES ====================

SKILL_TEMPLATES = {
    "project_conventions": Skill(
        name="project-conventions",
        description="Project coding conventions and standards",
        content="""# Project Conventions

## Code Style
- Follow PEP 8 for Python code
- Use type hints for all function parameters and return values
- Maximum line length: 100 characters

## Naming Conventions
- Classes: PascalCase
- Functions/methods: snake_case
- Constants: UPPER_SNAKE_CASE
- Private members: _leading_underscore

## Documentation
- All public functions must have docstrings
- Use Google-style docstrings
- Include examples for complex functions

## Testing
- Write unit tests for all new features
- Maintain >80% code coverage
- Use pytest for testing
""",
    ),
    
    "api_design": Skill(
        name="api-design",
        description="REST API design best practices",
        content="""# API Design Guidelines

## Endpoints
- Use plural nouns for resources (e.g., /users, /projects)
- Use HTTP methods correctly:
  - GET: Retrieve resources
  - POST: Create new resources
  - PUT: Update entire resources
  - PATCH: Partial updates
  - DELETE: Remove resources

## Response Format
- Always return JSON
- Use consistent response structure:
  ```json
  {
    "data": {...},
    "meta": {...},
    "errors": [...]
  }
  ```

## Error Handling
- Use appropriate HTTP status codes
- Include error details in response body
- Log all errors with context

## Versioning
- Use URL versioning (e.g., /api/v1/users)
- Maintain backward compatibility
""",
    ),
    
    "database_patterns": Skill(
        name="database-patterns",
        description="Database design and query patterns",
        content="""# Database Patterns

## Schema Design
- Use UUIDs for primary keys
- Include created_at and updated_at timestamps
- Use soft deletes (deleted_at) when appropriate

## Queries
- Always use parameterized queries
- Avoid N+1 queries - use eager loading
- Index frequently queried columns

## Migrations
- One change per migration
- Always include rollback logic
- Test migrations on staging first

## Performance
- Use connection pooling
- Implement query caching where appropriate
- Monitor slow queries
""",
    ),
    
    "security_practices": Skill(
        name="security-practices",
        description="Security best practices and guidelines",
        content="""# Security Practices

## Authentication
- Use JWT tokens with short expiration
- Implement refresh token rotation
- Hash passwords with bcrypt

## Authorization
- Implement role-based access control
- Check permissions at API level
- Log all authorization failures

## Input Validation
- Validate all user input
- Sanitize data before storage
- Use allowlists over denylists

## Secrets Management
- Never commit secrets to version control
- Use environment variables
- Rotate secrets regularly
""",
    ),
    
    "testing_strategy": Skill(
        name="testing-strategy",
        description="Testing strategy and patterns",
        content="""# Testing Strategy

## Test Types
- Unit tests: Test individual functions
- Integration tests: Test component interactions
- E2E tests: Test complete workflows

## Test Structure
- Arrange: Set up test data
- Act: Execute the code under test
- Assert: Verify the results

## Mocking
- Mock external dependencies
- Use fixtures for common test data
- Avoid over-mocking

## Coverage
- Aim for >80% code coverage
- Focus on critical paths
- Don't test trivial code
""",
    ),
}


# ==================== SKILL MANAGER ====================

class KiloSkillManager:
    """
    Manages Kilo Code skills.
    
    This service handles:
    - Creating and managing skills
    - Injecting skills into projects
    - Loading skills from directories
    - Generating skills from SmartSpec context
    """
    
    def __init__(self, global_skills_dir: Optional[str] = None):
        """
        Initialize the skill manager.
        
        Args:
            global_skills_dir: Path to global skills directory
                              (default: ~/.kilocode/skills/)
        """
        self.global_skills_dir = Path(
            global_skills_dir or os.path.expanduser("~/.kilocode/skills")
        )
        
        logger.info(
            "Kilo skill manager initialized",
            global_skills_dir=str(self.global_skills_dir),
        )
    
    def _get_skills_dir(
        self,
        workspace: str,
        scope: SkillScope,
        mode: SkillMode = SkillMode.GENERIC,
    ) -> Path:
        """
        Get the skills directory for a given scope and mode.
        
        Args:
            workspace: Workspace directory
            scope: Skill scope (global or project)
            mode: Skill mode
        
        Returns:
            Path to skills directory
        """
        if scope == SkillScope.GLOBAL:
            base_dir = self.global_skills_dir
        else:
            base_dir = Path(workspace) / ".kilocode"
        
        if mode == SkillMode.GENERIC:
            return base_dir / "skills"
        else:
            return base_dir / f"skills-{mode.value}"
    
    def create_skill(
        self,
        workspace: str,
        skill: Skill,
    ) -> Path:
        """
        Create a skill in the workspace.
        
        Args:
            workspace: Workspace directory
            skill: Skill to create
        
        Returns:
            Path to created skill directory
        """
        # Get skills directory
        skills_dir = self._get_skills_dir(workspace, skill.scope, skill.mode)
        skill_dir = skills_dir / skill.name
        
        # Create directory
        skill_dir.mkdir(parents=True, exist_ok=True)
        
        # Write SKILL.md
        skill_file = skill_dir / "SKILL.md"
        skill_file.write_text(skill.to_skill_md())
        
        logger.info(
            "Skill created",
            name=skill.name,
            path=str(skill_file),
        )
        
        return skill_dir
    
    def delete_skill(
        self,
        workspace: str,
        skill_name: str,
        scope: SkillScope = SkillScope.PROJECT,
        mode: SkillMode = SkillMode.GENERIC,
    ) -> bool:
        """
        Delete a skill.
        
        Args:
            workspace: Workspace directory
            skill_name: Name of skill to delete
            scope: Skill scope
            mode: Skill mode
        
        Returns:
            True if deleted
        """
        skills_dir = self._get_skills_dir(workspace, scope, mode)
        skill_dir = skills_dir / skill_name
        
        if skill_dir.exists():
            shutil.rmtree(skill_dir)
            logger.info("Skill deleted", name=skill_name)
            return True
        
        return False
    
    def get_skill(
        self,
        workspace: str,
        skill_name: str,
        scope: SkillScope = SkillScope.PROJECT,
        mode: SkillMode = SkillMode.GENERIC,
    ) -> Optional[Skill]:
        """
        Get a skill by name.
        
        Args:
            workspace: Workspace directory
            skill_name: Name of skill
            scope: Skill scope
            mode: Skill mode
        
        Returns:
            Skill if found
        """
        skills_dir = self._get_skills_dir(workspace, scope, mode)
        skill_file = skills_dir / skill_name / "SKILL.md"
        
        if skill_file.exists():
            content = skill_file.read_text()
            return Skill.from_skill_md(content, skill_name, scope, mode)
        
        return None
    
    def list_skills(
        self,
        workspace: str,
        scope: Optional[SkillScope] = None,
        mode: Optional[SkillMode] = None,
    ) -> List[Skill]:
        """
        List all skills for a workspace.
        
        Args:
            workspace: Workspace directory
            scope: Optional scope filter
            mode: Optional mode filter
        
        Returns:
            List of skills
        """
        skills = []
        
        # Determine scopes to search
        scopes = [scope] if scope else list(SkillScope)
        
        # Determine modes to search
        modes = [mode] if mode else list(SkillMode)
        
        for s in scopes:
            for m in modes:
                skills_dir = self._get_skills_dir(workspace, s, m)
                
                if not skills_dir.exists():
                    continue
                
                for skill_dir in skills_dir.iterdir():
                    if skill_dir.is_dir():
                        skill_file = skill_dir / "SKILL.md"
                        if skill_file.exists():
                            content = skill_file.read_text()
                            skill = Skill.from_skill_md(
                                content, skill_dir.name, s, m
                            )
                            skills.append(skill)
        
        return skills
    
    def inject_skill_from_template(
        self,
        workspace: str,
        template_name: str,
        scope: SkillScope = SkillScope.PROJECT,
        mode: SkillMode = SkillMode.GENERIC,
    ) -> Optional[Path]:
        """
        Inject a skill from a predefined template.
        
        Args:
            workspace: Workspace directory
            template_name: Name of template
            scope: Skill scope
            mode: Skill mode
        
        Returns:
            Path to created skill if successful
        """
        template = SKILL_TEMPLATES.get(template_name)
        
        if not template:
            logger.warning("Skill template not found", template=template_name)
            return None
        
        # Create a copy with the specified scope and mode
        skill = Skill(
            name=template.name,
            description=template.description,
            content=template.content,
            scope=scope,
            mode=mode,
            version=template.version,
            author=template.author,
            tags=template.tags,
        )
        
        return self.create_skill(workspace, skill)
    
    def inject_user_preferences(
        self,
        workspace: str,
        preferences: Dict[str, Any],
    ) -> Path:
        """
        Inject user preferences as a skill.
        
        Args:
            workspace: Workspace directory
            preferences: User preferences dictionary
        
        Returns:
            Path to created skill
        """
        # Build content from preferences
        content_parts = ["# User Preferences\n"]
        
        if "coding_style" in preferences:
            content_parts.append(f"## Coding Style\n{preferences['coding_style']}\n")
        
        if "preferred_patterns" in preferences:
            content_parts.append("## Preferred Patterns\n")
            for pattern in preferences.get("preferred_patterns", []):
                content_parts.append(f"- {pattern}\n")
        
        if "avoid_patterns" in preferences:
            content_parts.append("\n## Patterns to Avoid\n")
            for pattern in preferences.get("avoid_patterns", []):
                content_parts.append(f"- {pattern}\n")
        
        if "frameworks" in preferences:
            content_parts.append("\n## Preferred Frameworks\n")
            for framework in preferences.get("frameworks", []):
                content_parts.append(f"- {framework}\n")
        
        if "custom_rules" in preferences:
            content_parts.append("\n## Custom Rules\n")
            content_parts.append(preferences["custom_rules"])
        
        skill = Skill(
            name="user-preferences",
            description="User coding preferences and style guidelines",
            content="".join(content_parts),
            scope=SkillScope.PROJECT,
            mode=SkillMode.GENERIC,
        )
        
        return self.create_skill(workspace, skill)
    
    def inject_project_context(
        self,
        workspace: str,
        project_name: str,
        project_description: str,
        tech_stack: List[str],
        architecture: Optional[str] = None,
        constraints: Optional[List[str]] = None,
    ) -> Path:
        """
        Inject project context as a skill.
        
        Args:
            workspace: Workspace directory
            project_name: Project name
            project_description: Project description
            tech_stack: List of technologies used
            architecture: Architecture description
            constraints: List of constraints
        
        Returns:
            Path to created skill
        """
        content_parts = [f"# {project_name}\n\n"]
        content_parts.append(f"## Description\n{project_description}\n\n")
        
        content_parts.append("## Tech Stack\n")
        for tech in tech_stack:
            content_parts.append(f"- {tech}\n")
        
        if architecture:
            content_parts.append(f"\n## Architecture\n{architecture}\n")
        
        if constraints:
            content_parts.append("\n## Constraints\n")
            for constraint in constraints:
                content_parts.append(f"- {constraint}\n")
        
        skill = Skill(
            name="project-context",
            description=f"Context and guidelines for {project_name}",
            content="".join(content_parts),
            scope=SkillScope.PROJECT,
            mode=SkillMode.GENERIC,
        )
        
        return self.create_skill(workspace, skill)
    
    def inject_smartspec_context(
        self,
        workspace: str,
        semantic_memories: List[Dict[str, Any]],
        episodic_summaries: Optional[List[str]] = None,
    ) -> Path:
        """
        Inject SmartSpec context (memories) as a skill.
        
        Args:
            workspace: Workspace directory
            semantic_memories: List of semantic memory dictionaries
            episodic_summaries: Optional list of episodic memory summaries
        
        Returns:
            Path to created skill
        """
        content_parts = ["# SmartSpec Context\n\n"]
        
        # Group memories by type
        memories_by_type: Dict[str, List[Dict]] = {}
        for memory in semantic_memories:
            mem_type = memory.get("memory_type", "other")
            if mem_type not in memories_by_type:
                memories_by_type[mem_type] = []
            memories_by_type[mem_type].append(memory)
        
        # Add user preferences
        if "user_preference" in memories_by_type:
            content_parts.append("## User Preferences\n")
            for mem in memories_by_type["user_preference"]:
                content_parts.append(f"- **{mem.get('memory_key', '')}**: {mem.get('memory_value', '')}\n")
            content_parts.append("\n")
        
        # Add project facts
        if "project_fact" in memories_by_type:
            content_parts.append("## Project Facts\n")
            for mem in memories_by_type["project_fact"]:
                content_parts.append(f"- **{mem.get('memory_key', '')}**: {mem.get('memory_value', '')}\n")
            content_parts.append("\n")
        
        # Add skills/capabilities
        if "skill" in memories_by_type:
            content_parts.append("## Known Skills\n")
            for mem in memories_by_type["skill"]:
                content_parts.append(f"- {mem.get('memory_value', '')}\n")
            content_parts.append("\n")
        
        # Add rules
        if "rule" in memories_by_type:
            content_parts.append("## Rules\n")
            for mem in memories_by_type["rule"]:
                content_parts.append(f"- {mem.get('memory_value', '')}\n")
            content_parts.append("\n")
        
        # Add episodic summaries
        if episodic_summaries:
            content_parts.append("## Recent Context\n")
            for summary in episodic_summaries[:5]:  # Limit to 5
                content_parts.append(f"- {summary}\n")
        
        skill = Skill(
            name="smartspec-context",
            description="SmartSpec learned context and memories",
            content="".join(content_parts),
            scope=SkillScope.PROJECT,
            mode=SkillMode.GENERIC,
        )
        
        return self.create_skill(workspace, skill)
    
    def setup_project_skills(
        self,
        workspace: str,
        templates: Optional[List[str]] = None,
    ) -> List[Path]:
        """
        Set up default skills for a project.
        
        Args:
            workspace: Workspace directory
            templates: Optional list of template names to inject
        
        Returns:
            List of created skill paths
        """
        created = []
        
        # Use default templates if not specified
        if templates is None:
            templates = ["project_conventions", "testing_strategy"]
        
        for template_name in templates:
            path = self.inject_skill_from_template(workspace, template_name)
            if path:
                created.append(path)
        
        logger.info(
            "Project skills set up",
            workspace=workspace,
            skills_count=len(created),
        )
        
        return created


# ==================== GLOBAL INSTANCE ====================

_skill_manager: Optional[KiloSkillManager] = None


def get_kilo_skill_manager(
    global_skills_dir: Optional[str] = None,
    force_new: bool = False,
) -> KiloSkillManager:
    """
    Get the global Kilo skill manager instance.
    
    Args:
        global_skills_dir: Optional global skills directory
        force_new: Force creation of new instance
    
    Returns:
        KiloSkillManager instance
    """
    global _skill_manager
    
    if _skill_manager is None or force_new:
        _skill_manager = KiloSkillManager(global_skills_dir)
    
    return _skill_manager


def reset_kilo_skill_manager() -> None:
    """Reset the global skill manager instance."""
    global _skill_manager
    _skill_manager = None
