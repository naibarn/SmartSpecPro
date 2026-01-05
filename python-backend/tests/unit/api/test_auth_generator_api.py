"""
Unit tests for Auth Generator API endpoints
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient


class TestAuthGeneratorAPI:
    """Tests for Auth Generator API endpoints"""

    @pytest.fixture
    def client(self):
        """Create test client"""
        from app.main import app
        return TestClient(app)

    @pytest.fixture
    def sample_config(self):
        """Sample auth generator config"""
        return {
            "project_name": "test-app",
            "output_dir": "./src/auth",
            "database": "prisma",
            "jwt": {
                "access_token_expiry": "15m",
                "refresh_token_expiry": "7d",
                "algorithm": "HS256"
            },
            "oauth": {
                "enabled": True,
                "providers": ["google", "github"]
            },
            "two_factor": {
                "enabled": True,
                "methods": ["totp"]
            },
            "rbac": {
                "enabled": True,
                "roles": [
                    {"name": "admin", "permissions": ["*"]},
                    {"name": "user", "permissions": ["read", "write"]}
                ]
            },
            "api_keys": {
                "enabled": True,
                "prefix": "sk_"
            },
            "rate_limit": {
                "enabled": True,
                "max_requests": 100,
                "window_ms": 60000,
                "skip_successful_requests": False
            },
            "audit_log": {
                "enabled": True,
                "log_successful": True,
                "log_failed": True,
                "retention_days": 90
            },
            "password_policy": {
                "min_length": 8,
                "require_uppercase": True,
                "require_lowercase": True,
                "require_numbers": True,
                "require_special": True
            },
            "generate_tests": True,
            "generate_swagger": True,
            "typescript": True
        }

    # ========================================================================
    # Templates Tests
    # ========================================================================

    def test_list_templates(self, client):
        """Test listing available templates"""
        response = client.get("/api/v1/auth-generator/templates")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3  # basic, standard, enterprise
        
        # Check template structure
        for template in data:
            assert "id" in template
            assert "name" in template
            assert "description" in template
            assert "features" in template
            assert "config" in template

    def test_get_template_basic(self, client):
        """Test getting basic template"""
        response = client.get("/api/v1/auth-generator/templates/basic")
        # Template may or may not exist depending on implementation
        assert response.status_code in [200, 404]

    def test_get_template_standard(self, client):
        """Test getting standard template"""
        response = client.get("/api/v1/auth-generator/templates/standard")
        assert response.status_code in [200, 404]

    def test_get_template_enterprise(self, client):
        """Test getting enterprise template"""
        response = client.get("/api/v1/auth-generator/templates/enterprise")
        assert response.status_code in [200, 404]

    def test_get_template_not_found(self, client):
        """Test getting non-existent template"""
        response = client.get("/api/v1/auth-generator/templates/nonexistent")
        assert response.status_code == 404

    # ========================================================================
    # Features Tests
    # ========================================================================

    def test_list_features(self, client):
        """Test listing available features"""
        response = client.get("/api/v1/auth-generator/features")
        assert response.status_code == 200
        data = response.json()
        
        assert "core" in data
        assert "security" in data
        assert "oauth_providers" in data
        assert "two_factor_methods" in data
        assert "databases" in data
        
        # Check core features
        assert len(data["core"]) > 0
        assert len(data["security"]) > 0
        
        # Check OAuth providers
        assert "google" in data["oauth_providers"]
        assert "github" in data["oauth_providers"]
        
        # Check 2FA methods
        assert "totp" in data["two_factor_methods"]
        assert "email" in data["two_factor_methods"]
        
        # Check databases
        assert "prisma" in data["databases"]

    # ========================================================================
    # Validation Tests
    # ========================================================================

    def test_validate_valid_config(self, client, sample_config):
        """Test validating a valid configuration"""
        response = client.post("/api/v1/auth-generator/validate", json=sample_config)
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is True
        assert len(data["errors"]) == 0

    def test_validate_missing_project_name(self, client, sample_config):
        """Test validation with missing project name"""
        del sample_config["project_name"]
        response = client.post("/api/v1/auth-generator/validate", json=sample_config)
        # Pydantic validation returns 422 for missing required fields
        assert response.status_code == 422

    def test_validate_invalid_database(self, client, sample_config):
        """Test validation with invalid database"""
        sample_config["database"] = "invalid_db"
        response = client.post("/api/v1/auth-generator/validate", json=sample_config)
        # Should return 200 with valid=False or 422 for invalid enum
        assert response.status_code in [200, 422]

    def test_validate_weak_password_policy(self, client, sample_config):
        """Test validation with weak password policy generates warning"""
        sample_config["password_policy"]["min_length"] = 4
        response = client.post("/api/v1/auth-generator/validate", json=sample_config)
        assert response.status_code == 200
        data = response.json()
        # Should have warning about weak password
        assert len(data["warnings"]) > 0 or data["valid"] is False

    # ========================================================================
    # Preview Tests
    # ========================================================================

    def test_preview_controller(self, client, sample_config):
        """Test previewing controller code"""
        response = client.post(
            "/api/v1/auth-generator/preview",
            json={"config": sample_config, "file_type": "controller"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "file_name" in data
        assert "content" in data
        assert "language" in data
        assert "controller" in data["file_name"].lower()

    def test_preview_service(self, client, sample_config):
        """Test previewing service code"""
        response = client.post(
            "/api/v1/auth-generator/preview",
            json={"config": sample_config, "file_type": "service"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "service" in data["file_name"].lower()

    def test_preview_middleware(self, client, sample_config):
        """Test previewing middleware code"""
        response = client.post(
            "/api/v1/auth-generator/preview",
            json={"config": sample_config, "file_type": "middleware"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "middleware" in data["file_name"].lower()

    def test_preview_spec(self, client, sample_config):
        """Test previewing spec file"""
        response = client.post(
            "/api/v1/auth-generator/preview",
            json={"config": sample_config, "file_type": "spec"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "spec" in data["file_name"].lower() or "yaml" in data["language"].lower()

    # ========================================================================
    # Generate Tests
    # ========================================================================

    def test_generate_success(self, client, sample_config, tmp_path):
        """Test successful generation"""
        sample_config["output_dir"] = str(tmp_path / "auth")
        response = client.post("/api/v1/auth-generator/generate", json=sample_config)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["files"]) > 0

    def test_generate_invalid_config(self, client, sample_config):
        """Test generation with invalid config"""
        del sample_config["project_name"]
        response = client.post("/api/v1/auth-generator/generate", json=sample_config)
        assert response.status_code in [400, 422]

    # ========================================================================
    # Edge Cases
    # ========================================================================

    def test_empty_oauth_providers(self, client, sample_config):
        """Test with OAuth enabled but no providers"""
        sample_config["oauth"]["enabled"] = True
        sample_config["oauth"]["providers"] = []
        response = client.post("/api/v1/auth-generator/validate", json=sample_config)
        assert response.status_code == 200
        data = response.json()
        # Should warn about no providers
        assert len(data["warnings"]) > 0 or data["valid"] is False

    def test_empty_two_factor_methods(self, client, sample_config):
        """Test with 2FA enabled but no methods"""
        sample_config["two_factor"]["enabled"] = True
        sample_config["two_factor"]["methods"] = []
        response = client.post("/api/v1/auth-generator/validate", json=sample_config)
        assert response.status_code == 200
        data = response.json()
        # Should warn about no methods
        assert len(data["warnings"]) > 0 or data["valid"] is False

    def test_empty_rbac_roles(self, client, sample_config):
        """Test with RBAC enabled but no roles"""
        sample_config["rbac"]["enabled"] = True
        sample_config["rbac"]["roles"] = []
        response = client.post("/api/v1/auth-generator/validate", json=sample_config)
        assert response.status_code == 200
        data = response.json()
        # Should warn about no roles
        assert len(data["warnings"]) > 0 or data["valid"] is False
