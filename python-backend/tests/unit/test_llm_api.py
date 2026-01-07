"""
Unit tests for LLM API
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.api.llm_v1 import router
from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.user import User


@pytest.fixture
def client():
    """Create a test client"""
    return TestClient(app)

class TestLLMAPI:
    """Test LLM API endpoints"""
    
    @pytest.fixture
    def mock_user(self):
        """Mock authenticated user with credits"""
        user = User(
            id="user_123",
            email="test@example.com",
            credits_balance=1000
        )
        return user

    @pytest.fixture
    def mock_db(self):
        return AsyncMock()

    @pytest.fixture
    def client_with_auth(self, client, mock_user, mock_db):
        """Client with auth override"""
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_db] = lambda: mock_db
        yield client
        app.dependency_overrides = {}

    @pytest.fixture
    def mock_services(self):
        """Mock services for LLM flow"""
        with patch("app.api.llm_v1.get_unified_client") as mock_client_factory, \
             patch("app.api.llm_v1.CreditService") as mock_credit_class, \
             patch("app.api.llm_v1.ModerationService") as mock_mod_class:
            
            # Setup LLM Client
            mock_llm_client = AsyncMock()
            mock_client_factory.return_value = mock_llm_client
            
            # Setup Credit Service
            mock_credit_service = AsyncMock()
            mock_credit_class.return_value = mock_credit_service
            mock_credit_service.get_balance.return_value = 1000
            
            # Setup Moderation Service
            mock_mod_service = AsyncMock()
            mock_mod_class.return_value = mock_mod_service
            
            # Defaults for moderation
            mock_mod_service.moderate_request.return_value = {
                "flagged": False,
                "action": "allow",
                "reason": None
            }
            mock_mod_service.moderate_response.return_value = {
                "flagged": False,
                "action": "allow",
                "reason": None
            }
            
            yield {
                "llm": mock_llm_client,
                "credit": mock_credit_service,
                "moderation": mock_mod_service
            }

    @pytest.mark.asyncio
    async def test_chat_completion_success(self, client_with_auth, mock_services):
        """Test POST /chat/completions success"""
        mock_llm = mock_services["llm"]
        mock_credit = mock_services["credit"]
        
        # Mock LLM response
        mock_llm.chat_completion.return_value = {
            "content": "Hello there",
            "model": "gpt-4",
            "provider": "openai",
            "usage": {"total_tokens": 10},
            "cost_usd": 0.001
        }
        
        payload = {
            "messages": [{"role": "user", "content": "Hi"}],
            "model": "gpt-4"
        }
        
        response = client_with_auth.post("/api/v1/llm/chat/completions", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["content"] == "Hello there"
        assert data["cost_usd"] == 0.001
        
        # Verify credits deducted
        mock_credit.deduct_credits.assert_called_once()
        mock_llm.chat_completion.assert_called_once()

    @pytest.mark.asyncio
    async def test_chat_completion_insufficient_credits(self, client_with_auth, mock_services):
        """Test POST /chat/completions no credits"""
        mock_credit = mock_services["credit"]
        mock_credit.get_balance.return_value = 0
        
        payload = {
            "messages": [{"role": "user", "content": "Hi"}]
        }
        
        response = client_with_auth.post("/api/v1/llm/chat/completions", json=payload)
        
        assert response.status_code == 402
        assert "Insufficient credits" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_chat_completion_moderation_fail(self, client_with_auth, mock_services):
        """Test POST /chat/completions moderation block"""
        mock_mod = mock_services["moderation"]
        mock_mod.moderate_request.return_value = {
            "flagged": True,
            "action": "blocked",
            "reason": "bad content"
        }
        
        payload = {
            "messages": [{"role": "user", "content": "bad"}],
            "moderate": True
        }
        
        response = client_with_auth.post("/api/v1/llm/chat/completions", json=payload)
        
        assert response.status_code == 400
        assert "Content moderation failed" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_chat_stream_init(self, client_with_auth, mock_services):
        """Test POST /chat/stream init"""
        with patch("app.api.llm_v1.StreamingService") as mock_stream_class:
            mock_stream_service = Mock()
            mock_stream_class.return_value = mock_stream_service
            
            # Mock generator
            async def mock_generator(*args, **kwargs):
                yield "data: test\n\n"
            
            mock_stream_service.stream_chat_completion.return_value = mock_generator()
            
            payload = {
                "messages": [{"role": "user", "content": "Hi"}],
                "stream": True
            }
            
            response = client_with_auth.post("/api/v1/llm/chat/stream", json=payload)
            
            assert response.status_code == 200
            # We can't easily check stream content with TestClient sync, but 200 means it started

    def test_moderate_content(self, client_with_auth, mock_services):
        """Test POST /moderate"""
        response = client_with_auth.post("/api/v1/llm/moderate?content=test")
        
        assert response.status_code == 200
        assert response.json()["action"] == "allow"
