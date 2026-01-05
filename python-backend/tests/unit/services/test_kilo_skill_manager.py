"""
Unit tests for KiloSkillManager service.
"""

import pytest
from pathlib import Path

from app.services.kilo_skill_manager import (
    KiloSkillManager,
    Skill,
    SkillScope,
    SkillMode,
    SKILL_TEMPLATES,
    get_kilo_skill_manager,
    reset_kilo_skill_manager,
)


@pytest.fixture
def skill_manager(tmp_path):
    """Create skill manager instance."""
    reset_kilo_skill_manager()
    global_dir = tmp_path / "global_skills"
    global_dir.mkdir()
    return KiloSkillManager(global_skills_dir=str(global_dir))


@pytest.fixture
def temp_workspace(tmp_path):
    """Create temporary workspace directory."""
    workspace = tmp_path / "test_workspace"
    workspace.mkdir()
    return str(workspace)


class TestSkill:
    """Tests for Skill data class."""
    
    def test_skill_to_dict(self):
        """Test skill serialization."""
        skill = Skill(
            name="test-skill",
            description="A test skill",
            content="# Test Content",
            scope=SkillScope.PROJECT,
            mode=SkillMode.CODE,
            version="1.0.0",
            tags=["test", "example"],
        )
        
        data = skill.to_dict()
        assert data["name"] == "test-skill"
        assert data["description"] == "A test skill"
        assert data["scope"] == "project"
        assert data["mode"] == "code"
        assert data["tags"] == ["test", "example"]
    
    def test_skill_to_skill_md(self):
        """Test skill to SKILL.md conversion."""
        skill = Skill(
            name="test-skill",
            description="A test skill",
            content="# Test Content\n\nSome instructions.",
            version="1.0.0",
        )
        
        md = skill.to_skill_md()
        
        assert "---" in md
        assert "name: test-skill" in md
        assert "description: A test skill" in md
        assert "# Test Content" in md
    
    def test_skill_from_skill_md(self):
        """Test parsing SKILL.md content."""
        content = """---
name: api-design
description: REST API design best practices
version: 2.0.0
tags:
  - api
  - rest
---

# API Design Guidelines

Follow these conventions...
"""
        
        skill = Skill.from_skill_md(
            content=content,
            name="api-design",
            scope=SkillScope.PROJECT,
            mode=SkillMode.GENERIC,
        )
        
        assert skill.name == "api-design"
        assert skill.description == "REST API design best practices"
        assert skill.version == "2.0.0"
        assert "api" in skill.tags
        assert "# API Design Guidelines" in skill.content
    
    def test_skill_from_skill_md_no_frontmatter(self):
        """Test parsing SKILL.md without frontmatter."""
        content = "# Simple Skill\n\nJust content."
        
        skill = Skill.from_skill_md(
            content=content,
            name="simple",
            scope=SkillScope.PROJECT,
            mode=SkillMode.GENERIC,
        )
        
        assert skill.name == "simple"
        assert skill.content == content


class TestKiloSkillManager:
    """Tests for KiloSkillManager."""
    
    def test_init(self, skill_manager, tmp_path):
        """Test skill manager initialization."""
        assert skill_manager.global_skills_dir == tmp_path / "global_skills"
    
    def test_create_skill(self, skill_manager, temp_workspace):
        """Test creating a skill."""
        skill = Skill(
            name="my-skill",
            description="My custom skill",
            content="# My Skill\n\nInstructions here.",
        )
        
        path = skill_manager.create_skill(temp_workspace, skill)
        
        assert path.exists()
        assert (path / "SKILL.md").exists()
        
        content = (path / "SKILL.md").read_text()
        assert "my-skill" in content
        assert "My custom skill" in content
    
    def test_create_skill_mode_specific(self, skill_manager, temp_workspace):
        """Test creating mode-specific skill."""
        skill = Skill(
            name="code-skill",
            description="Code mode skill",
            content="# Code Skill",
            scope=SkillScope.PROJECT,
            mode=SkillMode.CODE,
        )
        
        path = skill_manager.create_skill(temp_workspace, skill)
        
        assert "skills-code" in str(path)
        assert path.exists()
    
    def test_delete_skill(self, skill_manager, temp_workspace):
        """Test deleting a skill."""
        skill = Skill(
            name="to-delete",
            description="Will be deleted",
            content="# Delete Me",
        )
        
        path = skill_manager.create_skill(temp_workspace, skill)
        assert path.exists()
        
        result = skill_manager.delete_skill(temp_workspace, "to-delete")
        assert result is True
        assert not path.exists()
    
    def test_delete_skill_not_found(self, skill_manager, temp_workspace):
        """Test deleting non-existent skill."""
        result = skill_manager.delete_skill(temp_workspace, "nonexistent")
        assert result is False
    
    def test_get_skill(self, skill_manager, temp_workspace):
        """Test getting a skill."""
        skill = Skill(
            name="get-me",
            description="Get this skill",
            content="# Get Me",
        )
        
        skill_manager.create_skill(temp_workspace, skill)
        
        retrieved = skill_manager.get_skill(temp_workspace, "get-me")
        
        assert retrieved is not None
        assert retrieved.name == "get-me"
        assert retrieved.description == "Get this skill"
    
    def test_get_skill_not_found(self, skill_manager, temp_workspace):
        """Test getting non-existent skill."""
        result = skill_manager.get_skill(temp_workspace, "nonexistent")
        assert result is None
    
    def test_list_skills(self, skill_manager, temp_workspace):
        """Test listing skills."""
        # Create multiple skills
        for i in range(3):
            skill = Skill(
                name=f"skill-{i}",
                description=f"Skill {i}",
                content=f"# Skill {i}",
            )
            skill_manager.create_skill(temp_workspace, skill)
        
        skills = skill_manager.list_skills(temp_workspace)
        
        assert len(skills) == 3
        names = {s.name for s in skills}
        assert "skill-0" in names
        assert "skill-1" in names
        assert "skill-2" in names
    
    def test_list_skills_with_scope_filter(self, skill_manager, temp_workspace):
        """Test listing skills with scope filter."""
        skill = Skill(
            name="project-skill",
            description="Project skill",
            content="# Project",
            scope=SkillScope.PROJECT,
        )
        skill_manager.create_skill(temp_workspace, skill)
        
        skills = skill_manager.list_skills(
            temp_workspace,
            scope=SkillScope.PROJECT,
        )
        
        assert len(skills) == 1
        assert skills[0].name == "project-skill"
    
    def test_inject_skill_from_template(self, skill_manager, temp_workspace):
        """Test injecting skill from template."""
        path = skill_manager.inject_skill_from_template(
            workspace=temp_workspace,
            template_name="project_conventions",
        )
        
        assert path is not None
        assert path.exists()
        
        content = (path / "SKILL.md").read_text()
        assert "project-conventions" in content
    
    def test_inject_skill_from_template_not_found(self, skill_manager, temp_workspace):
        """Test injecting non-existent template."""
        result = skill_manager.inject_skill_from_template(
            workspace=temp_workspace,
            template_name="nonexistent_template",
        )
        
        assert result is None
    
    def test_inject_user_preferences(self, skill_manager, temp_workspace):
        """Test injecting user preferences."""
        preferences = {
            "coding_style": "Clean and readable",
            "preferred_patterns": ["Factory", "Repository"],
            "avoid_patterns": ["Singleton"],
            "frameworks": ["FastAPI", "SQLAlchemy"],
            "custom_rules": "Always use type hints.",
        }
        
        path = skill_manager.inject_user_preferences(temp_workspace, preferences)
        
        assert path.exists()
        
        content = (path / "SKILL.md").read_text()
        assert "User Preferences" in content
        assert "Clean and readable" in content
        assert "Factory" in content
        assert "FastAPI" in content
    
    def test_inject_project_context(self, skill_manager, temp_workspace):
        """Test injecting project context."""
        path = skill_manager.inject_project_context(
            workspace=temp_workspace,
            project_name="SmartSpec",
            project_description="AI-powered spec generator",
            tech_stack=["Python", "FastAPI", "PostgreSQL"],
            architecture="Microservices",
            constraints=["Must be async", "No blocking I/O"],
        )
        
        assert path.exists()
        
        content = (path / "SKILL.md").read_text()
        assert "SmartSpec" in content
        assert "AI-powered spec generator" in content
        assert "Python" in content
        assert "Microservices" in content
    
    def test_inject_smartspec_context(self, skill_manager, temp_workspace):
        """Test injecting SmartSpec context."""
        memories = [
            {
                "memory_type": "user_preference",
                "memory_key": "theme",
                "memory_value": "dark",
            },
            {
                "memory_type": "project_fact",
                "memory_key": "framework",
                "memory_value": "FastAPI",
            },
            {
                "memory_type": "skill",
                "memory_key": "python",
                "memory_value": "Python programming",
            },
        ]
        
        path = skill_manager.inject_smartspec_context(
            workspace=temp_workspace,
            semantic_memories=memories,
            episodic_summaries=["Fixed bug in auth", "Added new feature"],
        )
        
        assert path.exists()
        
        content = (path / "SKILL.md").read_text()
        assert "SmartSpec Context" in content
        assert "User Preferences" in content
        assert "Project Facts" in content
    
    def test_setup_project_skills(self, skill_manager, temp_workspace):
        """Test setting up project skills."""
        paths = skill_manager.setup_project_skills(
            workspace=temp_workspace,
            templates=["project_conventions", "testing_strategy"],
        )
        
        assert len(paths) == 2
        for path in paths:
            assert path.exists()


class TestSkillTemplates:
    """Tests for skill templates."""
    
    def test_templates_exist(self):
        """Test that templates are defined."""
        assert "project_conventions" in SKILL_TEMPLATES
        assert "api_design" in SKILL_TEMPLATES
        assert "database_patterns" in SKILL_TEMPLATES
        assert "security_practices" in SKILL_TEMPLATES
        assert "testing_strategy" in SKILL_TEMPLATES
    
    def test_template_structure(self):
        """Test template structure."""
        for name, template in SKILL_TEMPLATES.items():
            assert template.name is not None
            assert template.description is not None
            assert template.content is not None
            assert len(template.content) > 0


class TestGlobalInstance:
    """Tests for global instance management."""
    
    def test_get_kilo_skill_manager(self, tmp_path):
        """Test getting global instance."""
        reset_kilo_skill_manager()
        
        manager1 = get_kilo_skill_manager(str(tmp_path))
        manager2 = get_kilo_skill_manager()
        
        assert manager1 is manager2
    
    def test_reset_kilo_skill_manager(self, tmp_path):
        """Test resetting global instance."""
        manager1 = get_kilo_skill_manager(str(tmp_path))
        reset_kilo_skill_manager()
        manager2 = get_kilo_skill_manager(str(tmp_path))
        
        assert manager1 is not manager2
