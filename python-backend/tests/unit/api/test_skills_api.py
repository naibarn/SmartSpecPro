"""
Unit tests for Skills API endpoints.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from app.api.v1.skills import router
from app.services.kilo_skill_manager import Skill, SkillScope, SkillMode



@pytest.fixture
def app():
    """Create a test app"""
    from fastapi import FastAPI
    _app = FastAPI()
    _app.include_router(router, prefix="/api/v1")
    return _app

@pytest.fixture
def client(app):
    """Create a test client"""
    return TestClient(app)


class TestSkillsAPI:
    """Tests for Skills API endpoints."""

    @pytest.fixture
    def sample_skill(self):
        """Create a sample skill for testing."""
        skill = Skill(
            name="test-skill",
            description="A test skill",
            content="# Test Skill\n\nThis is a test.",
            scope=SkillScope.PROJECT,
            mode=SkillMode.CODE,
            tags=["test", "sample"],
        )
        # Add file_path as attribute for API response
        skill.file_path = "/workspace/.kilocode/skills/test-skill/SKILL.md"
        return skill

    @pytest.fixture
    def mock_skill_manager(self, sample_skill):
        """Create a mock skill manager."""
        manager = MagicMock()
        manager.list_skills = AsyncMock(return_value=[sample_skill])
        manager.get_skill = AsyncMock(return_value=sample_skill)
        manager.create_skill = AsyncMock(return_value="/workspace/.kilocode/skills/test-skill/SKILL.md")
        manager.update_skill = AsyncMock(return_value="/workspace/.kilocode/skills/test-skill/SKILL.md")
        manager.delete_skill = AsyncMock(return_value=True)
        manager.inject_template = AsyncMock(return_value="/workspace/.kilocode/skills/template/SKILL.md")
        manager.inject_smartspec_context = AsyncMock(return_value="/workspace/.kilocode/skills/smartspec-context/SKILL.md")
        return manager


class TestListSkills(TestSkillsAPI):
    """Tests for GET /skills endpoint."""

    def test_list_skills_success(self, client, mock_skill_manager, sample_skill):
        """Test listing skills successfully."""
        with patch("app.api.v1.skills.get_kilo_skill_manager", return_value=mock_skill_manager):
            response = client.get("/api/v1/skills", params={"workspace": "/workspace"})
            
            assert response.status_code == 200
            data = response.json()
            assert data["total"] == 1
            assert len(data["skills"]) == 1
            assert data["skills"][0]["name"] == "test-skill"

    def test_list_skills_with_mode_filter(self, client, mock_skill_manager):
        """Test listing skills with mode filter."""
        with patch("app.api.v1.skills.get_kilo_skill_manager", return_value=mock_skill_manager):
            response = client.get(
                "/api/v1/skills",
                params={"workspace": "/workspace", "mode": "code"}
            )
            
            assert response.status_code == 200
            mock_skill_manager.list_skills.assert_called_once()

    def test_list_skills_missing_workspace(self, client):
        """Test listing skills without workspace parameter."""
        response = client.get("/api/v1/skills")
        assert response.status_code == 422  # Validation error


class TestGetSkill(TestSkillsAPI):
    """Tests for GET /skills/{skill_name} endpoint."""

    def test_get_skill_success(self, client, mock_skill_manager, sample_skill):
        """Test getting a skill successfully."""
        with patch("app.api.v1.skills.get_kilo_skill_manager", return_value=mock_skill_manager):
            response = client.get(
                "/api/v1/skills/test-skill",
                params={"workspace": "/workspace"}
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["name"] == "test-skill"
            assert data["description"] == "A test skill"

    def test_get_skill_not_found(self, client, mock_skill_manager):
        """Test getting a non-existent skill."""
        mock_skill_manager.get_skill = AsyncMock(return_value=None)
        
        with patch("app.api.v1.skills.get_kilo_skill_manager", return_value=mock_skill_manager):
            response = client.get(
                "/api/v1/skills/nonexistent",
                params={"workspace": "/workspace"}
            )
            
            assert response.status_code == 404


class TestCreateSkill(TestSkillsAPI):
    """Tests for POST /skills endpoint."""

    def test_create_skill_success(self, client, mock_skill_manager):
        """Test creating a skill successfully."""
        with patch("app.api.v1.skills.get_kilo_skill_manager", return_value=mock_skill_manager):
            response = client.post(
                "/api/v1/skills",
                params={"workspace": "/workspace"},
                json={
                    "name": "new-skill",
                    "description": "A new skill",
                    "content": "# New Skill",
                    "scope": "project",
                    "mode": "code",
                    "tags": ["new"],
                }
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["name"] == "new-skill"

    def test_create_skill_invalid_data(self, client):
        """Test creating a skill with invalid data."""
        response = client.post(
            "/api/v1/skills",
            params={"workspace": "/workspace"},
            json={
                "description": "Missing name",
                "content": "# Content",
            }
        )
        
        assert response.status_code == 422  # Validation error


class TestUpdateSkill(TestSkillsAPI):
    """Tests for PUT /skills/{skill_name} endpoint."""

    def test_update_skill_success(self, client, mock_skill_manager, sample_skill):
        """Test updating a skill successfully."""
        with patch("app.api.v1.skills.get_kilo_skill_manager", return_value=mock_skill_manager):
            response = client.put(
                "/api/v1/skills/test-skill",
                params={"workspace": "/workspace"},
                json={
                    "description": "Updated description",
                }
            )
            
            assert response.status_code == 200

    def test_update_skill_not_found(self, client, mock_skill_manager):
        """Test updating a non-existent skill."""
        mock_skill_manager.get_skill = AsyncMock(return_value=None)
        
        with patch("app.api.v1.skills.get_kilo_skill_manager", return_value=mock_skill_manager):
            response = client.put(
                "/api/v1/skills/nonexistent",
                params={"workspace": "/workspace"},
                json={"description": "Updated"}
            )
            
            assert response.status_code == 404


class TestDeleteSkill(TestSkillsAPI):
    """Tests for DELETE /skills/{skill_name} endpoint."""

    def test_delete_skill_success(self, client, mock_skill_manager):
        """Test deleting a skill successfully."""
        with patch("app.api.v1.skills.get_kilo_skill_manager", return_value=mock_skill_manager):
            response = client.delete(
                "/api/v1/skills/test-skill",
                params={"workspace": "/workspace"}
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True

    def test_delete_skill_not_found(self, client, mock_skill_manager):
        """Test deleting a non-existent skill."""
        mock_skill_manager.delete_skill = AsyncMock(return_value=False)
        
        with patch("app.api.v1.skills.get_kilo_skill_manager", return_value=mock_skill_manager):
            response = client.delete(
                "/api/v1/skills/nonexistent",
                params={"workspace": "/workspace"}
            )
            
            assert response.status_code == 404


class TestTemplates(TestSkillsAPI):
    """Tests for template endpoints."""

    def test_list_templates(self, client):
        """Test listing templates."""
        from app.services.kilo_skill_manager import SKILL_TEMPLATES
        
        response = client.get("/api/v1/skills/templates")
        
        assert response.status_code == 200
        data = response.json()
        assert "templates" in data
        assert "total" in data
        assert data["total"] == len(SKILL_TEMPLATES)

    def test_get_template_success(self, client):
        """Test getting a specific template."""
        from app.services.kilo_skill_manager import SKILL_TEMPLATES
        
        # Get first template name
        template_name = list(SKILL_TEMPLATES.keys())[0]
        response = client.get(f"/api/v1/skills/templates/{template_name}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == template_name

    def test_get_template_not_found(self, client):
        """Test getting a non-existent template."""
        response = client.get("/api/v1/skills/templates/nonexistent-template")
        assert response.status_code == 404


class TestInjectTemplate(TestSkillsAPI):
    """Tests for POST /skills/inject/template endpoint."""

    def test_inject_template_success(self, client, mock_skill_manager):
        """Test injecting a template successfully."""
        from app.services.kilo_skill_manager import SKILL_TEMPLATES
        
        with patch("app.api.v1.skills.get_kilo_skill_manager", return_value=mock_skill_manager):
            # Get first template name
            template_name = list(SKILL_TEMPLATES.keys())[0]
            
            response = client.post(
                "/api/v1/skills/inject/template",
                params={"workspace": "/workspace"},
                json={"template_name": template_name}
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True

    def test_inject_template_not_found(self, client):
        """Test injecting a non-existent template."""
        response = client.post(
            "/api/v1/skills/inject/template",
            params={"workspace": "/workspace"},
            json={"template_name": "nonexistent-template"}
        )
        
        assert response.status_code == 404


class TestInjectContext(TestSkillsAPI):
    """Tests for POST /skills/inject/context endpoint."""

    def test_inject_context_success(self, client, mock_skill_manager):
        """Test injecting SmartSpec context successfully."""
        with patch("app.api.v1.skills.get_kilo_skill_manager", return_value=mock_skill_manager):
            response = client.post(
                "/api/v1/skills/inject/context",
                params={"workspace": "/workspace"},
                json={
                    "user_id": "user-123",
                    "project_id": "project-456",
                    "include_episodic": True,
                }
            )
            
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True


class TestSetupProject(TestSkillsAPI):
    """Tests for POST /skills/setup-project endpoint."""

    def test_setup_project_success(self, client, mock_skill_manager):
        """Test setting up project skills successfully."""
        with patch("app.api.v1.skills.get_kilo_skill_manager", return_value=mock_skill_manager):
            response = client.post(
                "/api/v1/skills/setup-project",
                params={"workspace": "/workspace"}
            )
            
            assert response.status_code == 200
            data = response.json()
            assert "results" in data
            assert "message" in data

    def test_setup_project_with_custom_templates(self, client, mock_skill_manager):
        """Test setting up project with custom templates."""
        from app.services.kilo_skill_manager import SKILL_TEMPLATES
        
        with patch("app.api.v1.skills.get_kilo_skill_manager", return_value=mock_skill_manager):
            # Get first two template names
            template_names = list(SKILL_TEMPLATES.keys())[:2]
            
            response = client.post(
                "/api/v1/skills/setup-project",
                params={
                    "workspace": "/workspace",
                    "templates": template_names,
                }
            )
            
            assert response.status_code == 200

    def test_sync_skills_success(self, client):
        """Test syncing skills successfully."""
        with patch("app.services.kilo_skill_manager_v2.SkillConverter.sync_directory", return_value={"skill1": True}):
            response = client.post(
                "/api/v1/skills/sync",
                params={"workspace": "/workspace"},
                json={"source_format": "kilo"}
            )
            assert response.status_code == 200
            assert response.json()["synced_count"] == 1

    def test_diff_skills_success(self, client):
        """Test getting skills diff."""
        with patch("pathlib.Path.exists", return_value=True), \
             patch("pathlib.Path.iterdir", return_value=[]):
            response = client.get("/api/v1/skills/diff", params={"workspace": "/workspace"})
            assert response.status_code == 200
            assert "synced" in response.json()

    def test_convert_skill_success(self, client, mock_skill_manager):
        """Test converting a skill."""
        # Using mock_skill_manager for convert endpoint
        with patch("app.services.kilo_skill_manager_v2.KiloSkillManager", return_value=mock_skill_manager):
            # Mock get_skill to return a mock skill
            mock_skill = MagicMock()
            mock_skill.name = "test-skill"
            mock_skill_manager.get_skill.return_value = mock_skill
            # Mock create_skill to return success for target format
            from app.services.kilo_skill_manager_v2 import SkillFormat
            mock_skill_manager.create_skill.return_value = {SkillFormat.CLAUDE: "/path/to/claude/skill"}
            
            response = client.post(
                "/api/v1/skills/convert",
                params={
                    "skill_name": "test-skill",
                    "workspace": "/workspace",
                    "source_format": "kilo",
                    "target_format": "claude"
                }
            )
            assert response.status_code == 200
            assert response.json()["success"] is True
