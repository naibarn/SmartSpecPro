"""
Tests for OpenCode Integration
Phase 1: Backend Fixes

Tests cover:
1. API Key Validation Service
2. OpenCode Gateway endpoints
3. OpenCodeAdapter functionality
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
import uuid

# Test fixtures and mocks
@pytest.fixture
def mock_db():
    """Create a mock database session."""
    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    return db


@pytest.fixture
def mock_user():
    """Create a mock user."""
    user = MagicMock()
    user.id = str(uuid.uuid4())
    user.email = "test@example.com"
    user.is_active = True
    return user


@pytest.fixture
def mock_api_key(mock_user):
    """Create a mock API key."""
    api_key = MagicMock()
    api_key.id = str(uuid.uuid4())
    api_key.user_id = mock_user.id
    api_key.user = mock_user
    api_key.name = "Test Key"
    api_key.key_hash = "test_hash"
    api_key.key_prefix = "sk-smartspec-...xxxx"
    api_key.is_active = True
    api_key.expires_at = datetime.utcnow() + timedelta(days=90)
    api_key.last_used_at = None
    api_key.permissions = {"endpoints": ["*"], "methods": ["*"]}
    api_key.rate_limit = 60
    api_key.is_valid = MagicMock(return_value=True)
    api_key.is_expired = MagicMock(return_value=False)
    api_key.has_permission = MagicMock(return_value=True)
    return api_key


# ==================== API KEY SERVICE TESTS ====================

class TestAPIKeyService:
    """Tests for APIKeyService."""
    
    def test_generate_api_key_format(self):
        """Test that generated API keys have correct format."""
        from app.services.api_key_service import APIKeyService
        
        key, key_hash, key_prefix = APIKeyService.generate_api_key()
        
        # Check format
        assert key.startswith("sk-smartspec-")
        assert len(key) > 20  # Should be substantial length
        assert len(key_hash) == 64  # SHA-256 hash
        assert "..." in key_prefix  # Should have ellipsis
    
    def test_generate_api_key_uniqueness(self):
        """Test that generated API keys are unique."""
        from app.services.api_key_service import APIKeyService
        
        keys = set()
        for _ in range(100):
            key, _, _ = APIKeyService.generate_api_key()
            assert key not in keys
            keys.add(key)
    
    @pytest.mark.asyncio
    async def test_validate_api_key_invalid_format(self, mock_db):
        """Test validation fails for invalid format."""
        from app.services.api_key_service import APIKeyService
        
        # Test various invalid formats
        invalid_keys = [
            "",
            "invalid",
            "sk-test-123",
            "sk_smartspec_123",
            "bearer sk-smartspec-123",
        ]
        
        for key in invalid_keys:
            result = await APIKeyService.validate_api_key(mock_db, key)
            assert result is None, f"Key '{key}' should be invalid"
    
    @pytest.mark.asyncio
    async def test_validate_api_key_not_found(self, mock_db):
        """Test validation fails when key not in database."""
        from app.services.api_key_service import APIKeyService
        
        # Mock database to return None
        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=None)
        mock_db.execute.return_value = mock_result
        
        result = await APIKeyService.validate_api_key(
            mock_db,
            "sk-smartspec-test123456789"
        )
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_validate_api_key_success(self, mock_db, mock_api_key, mock_user):
        """Test successful API key validation."""
        from app.services.api_key_service import APIKeyService
        
        # Mock database to return the API key
        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=mock_api_key)
        mock_db.execute.return_value = mock_result
        
        result = await APIKeyService.validate_api_key(
            mock_db,
            "sk-smartspec-test123456789"
        )
        
        assert result is not None
        api_key, user = result
        assert api_key == mock_api_key
        assert user == mock_user
    
    @pytest.mark.asyncio
    async def test_validate_api_key_expired(self, mock_db, mock_api_key):
        """Test validation fails for expired key."""
        from app.services.api_key_service import APIKeyService
        
        # Set key as expired
        mock_api_key.is_valid = MagicMock(return_value=False)
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none = MagicMock(return_value=mock_api_key)
        mock_db.execute.return_value = mock_result
        
        result = await APIKeyService.validate_api_key(
            mock_db,
            "sk-smartspec-test123456789"
        )
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_create_opencode_api_key(self, mock_db, mock_user):
        """Test creating an OpenCode API key."""
        from app.services.api_key_service import APIKeyService
        
        api_key, raw_key = await APIKeyService.create_opencode_api_key(
            db=mock_db,
            user=mock_user,
            name="Test OpenCode Key",
            expires_in_days=30,
        )
        
        # Verify key was added to database
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called()
        
        # Verify raw key format
        assert raw_key.startswith("sk-smartspec-")


# ==================== TOKEN GENERATOR TESTS ====================

class TestTokenGenerator:
    """Tests for TokenGenerator."""
    
    def test_generate_api_key_prefix(self):
        """Test API key has correct prefix."""
        from app.core.security_enhanced import TokenGenerator
        
        key = TokenGenerator.generate_api_key()
        assert key.startswith("sk-smartspec-")
    
    def test_hash_token_consistency(self):
        """Test that hashing is consistent."""
        from app.core.security_enhanced import TokenGenerator
        
        token = "test-token-123"
        hash1 = TokenGenerator.hash_token(token)
        hash2 = TokenGenerator.hash_token(token)
        
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA-256
    
    def test_hash_token_different_inputs(self):
        """Test that different inputs produce different hashes."""
        from app.core.security_enhanced import TokenGenerator
        
        hash1 = TokenGenerator.hash_token("token1")
        hash2 = TokenGenerator.hash_token("token2")
        
        assert hash1 != hash2
    
    def test_is_valid_api_key_format(self):
        """Test API key format validation."""
        from app.core.security_enhanced import TokenGenerator
        
        # Valid formats
        assert TokenGenerator.is_valid_api_key_format("sk-smartspec-abc123")
        assert TokenGenerator.is_valid_api_key_format("sk-smartspec-" + "x" * 43)
        
        # Invalid formats
        assert not TokenGenerator.is_valid_api_key_format("")
        assert not TokenGenerator.is_valid_api_key_format("sk-test-123")
        assert not TokenGenerator.is_valid_api_key_format("invalid")
        assert not TokenGenerator.is_valid_api_key_format(None)


# ==================== OPENCODE GATEWAY TESTS ====================

class TestOpenCodeGateway:
    """Tests for OpenCode Gateway endpoints."""
    
    @pytest.mark.asyncio
    async def test_list_models(self):
        """Test listing available models."""
        from app.api.opencode_gateway import AVAILABLE_MODELS
        
        assert len(AVAILABLE_MODELS) > 0
        
        # Check model structure
        for model in AVAILABLE_MODELS:
            assert "id" in model
            assert "owned_by" in model
    
    @pytest.mark.asyncio
    async def test_health_check(self):
        """Test health check endpoint."""
        from app.api.opencode_gateway import health_check
        
        result = await health_check()
        
        assert result["status"] == "ok"
        assert result["service"] == "opencode-gateway"
        assert "version" in result
        assert "timestamp" in result


# ==================== OPENCODE ADAPTER TESTS ====================

class TestOpenCodeAdapter:
    """Tests for OpenCodeAdapter."""
    
    def test_adapter_initialization(self):
        """Test adapter initialization."""
        from app.orchestrator.agents.opencode_adapter import OpenCodeAdapter
        
        adapter = OpenCodeAdapter(
            api_base_url="http://localhost:8000/v1/opencode",
            api_key="sk-smartspec-test123",
            workspace_path="/tmp/test",
        )
        
        assert adapter.api_base_url == "http://localhost:8000/v1/opencode"
        assert adapter.api_key == "sk-smartspec-test123"
        assert adapter.workspace_path == "/tmp/test"
    
    def test_build_system_prompt(self):
        """Test system prompt building."""
        from app.orchestrator.agents.opencode_adapter import (
            OpenCodeAdapter,
            OpenCodeExecutionRequest,
        )
        
        adapter = OpenCodeAdapter(workspace_path="/test/workspace")
        request = OpenCodeExecutionRequest(
            prompt="Test prompt",
            workspace_path="/test/workspace",
        )
        
        prompt = adapter._build_system_prompt(request)
        
        assert "expert software engineer" in prompt
        assert "/test/workspace" in prompt
        assert "Guidelines" in prompt
    
    def test_parse_file_changes(self):
        """Test parsing file changes from LLM output."""
        from app.orchestrator.agents.opencode_adapter import (
            OpenCodeAdapter,
            OpenCodeExecutionRequest,
        )
        
        adapter = OpenCodeAdapter(workspace_path="/tmp")
        request = OpenCodeExecutionRequest(workspace_path="/tmp")
        
        content = """Here's the updated code:

```filepath:src/main.py
print("Hello, World!")
```

And a new file:

```filepath:src/utils.py
def helper():
    pass
```
"""
        
        created, modified = adapter._parse_file_changes(content, request)
        
        # Both should be in created since files don't exist
        assert len(created) + len(modified) == 2
    
    @pytest.mark.asyncio
    async def test_run_command_success(self):
        """Test running a simple command."""
        from app.orchestrator.agents.opencode_adapter import OpenCodeAdapter
        
        adapter = OpenCodeAdapter()
        result = await adapter.run_command("echo 'Hello, World!'")
        
        assert result.success
        assert "Hello, World!" in result.stdout
        assert result.return_code == 0
    
    @pytest.mark.asyncio
    async def test_run_command_failure(self):
        """Test handling command failure."""
        from app.orchestrator.agents.opencode_adapter import OpenCodeAdapter
        
        adapter = OpenCodeAdapter()
        result = await adapter.run_command("exit 1")
        
        assert not result.success
        assert result.return_code == 1
    
    @pytest.mark.asyncio
    async def test_edit_file_create(self, tmp_path):
        """Test creating a new file."""
        from app.orchestrator.agents.opencode_adapter import OpenCodeAdapter
        
        adapter = OpenCodeAdapter(workspace_path=str(tmp_path))
        
        result = await adapter.edit_file(
            file_path="test.txt",
            content="Hello, World!",
        )
        
        assert result["status"] == "success"
        assert result["created"] is True
        
        # Verify file was created
        file_path = tmp_path / "test.txt"
        assert file_path.exists()
        assert file_path.read_text() == "Hello, World!"
    
    @pytest.mark.asyncio
    async def test_edit_file_modify(self, tmp_path):
        """Test modifying an existing file."""
        from app.orchestrator.agents.opencode_adapter import OpenCodeAdapter
        
        # Create initial file
        file_path = tmp_path / "test.txt"
        file_path.write_text("Original content")
        
        adapter = OpenCodeAdapter(workspace_path=str(tmp_path))
        
        result = await adapter.edit_file(
            file_path="test.txt",
            content="Modified content",
        )
        
        assert result["status"] == "success"
        assert result["created"] is False
        assert result["backup_path"] is not None
        
        # Verify file was modified
        assert file_path.read_text() == "Modified content"
    
    @pytest.mark.asyncio
    async def test_read_file(self, tmp_path):
        """Test reading a file."""
        from app.orchestrator.agents.opencode_adapter import OpenCodeAdapter
        
        # Create test file
        file_path = tmp_path / "test.txt"
        file_path.write_text("Test content")
        
        adapter = OpenCodeAdapter(workspace_path=str(tmp_path))
        
        result = await adapter.read_file("test.txt")
        
        assert result["status"] == "success"
        assert result["content"] == "Test content"
    
    @pytest.mark.asyncio
    async def test_read_file_not_found(self, tmp_path):
        """Test reading a non-existent file."""
        from app.orchestrator.agents.opencode_adapter import OpenCodeAdapter
        
        adapter = OpenCodeAdapter(workspace_path=str(tmp_path))
        
        result = await adapter.read_file("nonexistent.txt")
        
        assert result["status"] == "error"
        assert "not found" in result["error"].lower()
    
    @pytest.mark.asyncio
    async def test_check_health_unhealthy(self):
        """Test health check when gateway is unavailable."""
        from app.orchestrator.agents.opencode_adapter import OpenCodeAdapter
        
        adapter = OpenCodeAdapter(
            api_base_url="http://localhost:99999/v1/opencode"
        )
        
        result = await adapter.check_health()
        
        assert result["status"] == "unhealthy"
        assert "error" in result
        
        await adapter.cleanup()
    
    @pytest.mark.asyncio
    async def test_cleanup(self):
        """Test adapter cleanup."""
        from app.orchestrator.agents.opencode_adapter import OpenCodeAdapter
        
        adapter = OpenCodeAdapter()
        
        # Create a session
        await adapter._get_session()
        assert adapter._http_session is not None
        
        # Cleanup
        await adapter.cleanup()
        assert adapter._http_session is None


# ==================== EXECUTION REQUEST/RESULT TESTS ====================

class TestDataClasses:
    """Tests for data classes."""
    
    def test_execution_request_defaults(self):
        """Test OpenCodeExecutionRequest defaults."""
        from app.orchestrator.agents.opencode_adapter import OpenCodeExecutionRequest
        
        request = OpenCodeExecutionRequest()
        
        assert request.request_id  # Should have auto-generated ID
        assert request.timeout_seconds == 180
        assert request.max_tokens == 8000
        assert request.files == []
        assert request.context == {}
    
    def test_execution_request_to_dict(self):
        """Test OpenCodeExecutionRequest serialization."""
        from app.orchestrator.agents.opencode_adapter import OpenCodeExecutionRequest
        
        request = OpenCodeExecutionRequest(
            project_id="proj-123",
            user_id="user-456",
            prompt="Test prompt",
        )
        
        data = request.to_dict()
        
        assert data["project_id"] == "proj-123"
        assert data["user_id"] == "user-456"
        assert data["prompt"] == "Test prompt"
    
    def test_execution_result_to_dict(self):
        """Test OpenCodeExecutionResult serialization."""
        from app.orchestrator.agents.opencode_adapter import OpenCodeExecutionResult
        
        result = OpenCodeExecutionResult(
            request_id="req-123",
            success=True,
            output="Test output",
            tokens_used=100,
        )
        
        data = result.to_dict()
        
        assert data["request_id"] == "req-123"
        assert data["success"] is True
        assert data["output"] == "Test output"
        assert data["tokens_used"] == 100


# ==================== INTEGRATION TESTS ====================

class TestIntegration:
    """Integration tests for the complete flow."""
    
    @pytest.mark.asyncio
    async def test_api_key_lifecycle(self, mock_db, mock_user):
        """Test complete API key lifecycle."""
        from app.services.api_key_service import APIKeyService
        
        # Create key
        api_key, raw_key = await APIKeyService.create_opencode_api_key(
            db=mock_db,
            user=mock_user,
            name="Integration Test Key",
        )
        
        # Verify format
        assert raw_key.startswith("sk-smartspec-")
        
        # Verify database operations
        mock_db.add.assert_called()
        mock_db.commit.assert_called()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
