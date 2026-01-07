"""
Unit tests for Health API
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from fastapi import status
from datetime import datetime
from app.api.health import (
    check_database,
    check_redis,
    check_llm_proxy,
    health_check,
    readiness_check,
    liveness_check,
    ServiceStatus,
    HealthResponse
)

class TestHealthServiceChecks:
    """Test health check helper functions"""
    
    @pytest.mark.asyncio
    async def test_check_database_healthy(self):
        """Test healthy database check"""
        mock_db = AsyncMock()
        mock_db.execute = AsyncMock()
        
        status = await check_database(mock_db)
        
        assert status.name == "database"
        assert status.status == "healthy"
        assert status.message == "Connected"
        assert status.latency_ms >= 0

    @pytest.mark.asyncio
    async def test_check_database_unhealthy(self):
        """Test unhealthy database check"""
        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(side_effect=Exception("DB Error"))
        
        status = await check_database(mock_db)
        
        assert status.name == "database"
        assert status.status == "unhealthy"
        assert "Connection failed" in status.message

    @pytest.mark.asyncio
    async def test_check_redis_healthy(self):
        """Test healthy Redis check"""
        with patch("app.api.health.cache_manager") as mock_cache:
            mock_cache.redis = AsyncMock()
            mock_cache.redis.ping = AsyncMock()
            
            status = await check_redis()
            
            assert status.name == "redis"
            assert status.status == "healthy"
            assert status.message == "Connected"

    @pytest.mark.asyncio
    async def test_check_redis_not_initialized(self):
        """Test Redis not initialized"""
        with patch("app.api.health.cache_manager") as mock_cache:
            mock_cache.redis = None
            
            status = await check_redis()
            
            assert status.name == "redis"
            assert status.status == "degraded"
            assert "Not initialized" in status.message

    @pytest.mark.asyncio
    async def test_check_redis_error(self):
        """Test Redis error"""
        with patch("app.api.health.cache_manager") as mock_cache:
            mock_cache.redis = AsyncMock()
            mock_cache.redis.ping = AsyncMock(side_effect=Exception("Redis Error"))
            
            status = await check_redis()
            
            assert status.name == "redis"
            assert status.status == "degraded"
            assert "Connection failed" in status.message

    @pytest.mark.asyncio
    async def test_check_llm_proxy_healthy(self):
        """Test healthy LLM proxy"""
        with patch("app.api.health.unified_client") as mock_client:
            mock_client._initialized = True
            mock_client.openrouter_client = Mock() # Has OpenRouter
            mock_client.direct_providers = {}
            
            status = await check_llm_proxy()
            
            assert status.name == "llm_proxy"
            assert status.status == "healthy"
            assert "openrouter" in status.message

    @pytest.mark.asyncio
    async def test_check_llm_proxy_not_initialized(self):
        """Test LLM proxy not initialized"""
        with patch("app.api.health.unified_client") as mock_client:
            mock_client._initialized = False
            
            status = await check_llm_proxy()
            
            assert status.name == "llm_proxy"
            assert status.status == "degraded"
            assert "Not initialized" in status.message

    @pytest.mark.asyncio
    async def test_check_llm_proxy_no_providers(self):
        """Test LLM proxy with no providers"""
        with patch("app.api.health.unified_client") as mock_client:
            mock_client._initialized = True
            mock_client.openrouter_client = None
            mock_client.direct_providers = {}
            
            status = await check_llm_proxy()
            
            assert status.name == "llm_proxy"
            assert status.status == "unhealthy"
            assert "No providers" in status.message


class TestHealthEndpoints:
    """Test health endpoints"""
    
    @pytest.mark.asyncio
    async def test_health_check_all_healthy(self):
        """Test overall health check - All Healthy"""
        mock_db = AsyncMock()
        
        # Patch the check functions directly to simplify logic
        with patch("app.api.health.check_database", new_callable=AsyncMock) as mock_db_check, \
             patch("app.api.health.check_redis", new_callable=AsyncMock) as mock_redis_check, \
             patch("app.api.health.check_llm_proxy", new_callable=AsyncMock) as mock_llm_check:
            
            mock_db_check.return_value = ServiceStatus(name="database", status="healthy")
            mock_redis_check.return_value = ServiceStatus(name="redis", status="healthy")
            mock_llm_check.return_value = ServiceStatus(name="llm_proxy", status="healthy")
            
            response = await health_check(mock_db)
            
            assert response.status_code == 200
            
            # Using model_dump equivalent from response content
            import json
            content = json.loads(response.body)
            assert content["status"] == "healthy"
            assert len(content["services"]) == 3

    @pytest.mark.asyncio
    async def test_health_check_critical_unhealthy(self):
        """Test overall health check - Critical Service Unhealthy"""
        mock_db = AsyncMock()
        
        with patch("app.api.health.check_database", new_callable=AsyncMock) as mock_db_check, \
             patch("app.api.health.check_redis", new_callable=AsyncMock) as mock_redis_check, \
             patch("app.api.health.check_llm_proxy", new_callable=AsyncMock) as mock_llm_check:
            
            mock_db_check.return_value = ServiceStatus(name="database", status="unhealthy") # Critical
            mock_redis_check.return_value = ServiceStatus(name="redis", status="healthy")
            mock_llm_check.return_value = ServiceStatus(name="llm_proxy", status="healthy")
            
            response = await health_check(mock_db)
            
            assert response.status_code == 503
            import json
            content = json.loads(response.body)
            assert content["status"] == "unhealthy"

    @pytest.mark.asyncio
    async def test_health_check_degraded(self):
        """Test overall health check - Non-critical service unhealthy"""
        mock_db = AsyncMock()
        
        with patch("app.api.health.check_database", new_callable=AsyncMock) as mock_db_check, \
             patch("app.api.health.check_redis", new_callable=AsyncMock) as mock_redis_check, \
             patch("app.api.health.check_llm_proxy", new_callable=AsyncMock) as mock_llm_check:
            
            mock_db_check.return_value = ServiceStatus(name="database", status="healthy")
            mock_redis_check.return_value = ServiceStatus(name="redis", status="degraded") # Non-critical
            mock_llm_check.return_value = ServiceStatus(name="llm_proxy", status="healthy")
            
            response = await health_check(mock_db)
            
            assert response.status_code == 200
            import json
            content = json.loads(response.body)
            assert content["status"] == "degraded"

    @pytest.mark.asyncio
    async def test_readiness_check_ready(self):
        """Test readiness check - Ready"""
        mock_db = AsyncMock()
        
        with patch("app.api.health.unified_client") as mock_client:
            mock_client._initialized = True
            
            response = await readiness_check(mock_db)
            
            assert response.status_code == 200
            import json
            content = json.loads(response.body)
            assert content["status"] == "ready"
            mock_db.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_readiness_check_not_ready_db(self):
        """Test readiness check - DB fail"""
        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(side_effect=Exception("DB Error"))
        
        response = await readiness_check(mock_db)
        
        assert response.status_code == 503
        import json
        content = json.loads(response.body)
        assert content["status"] == "not_ready"

    @pytest.mark.asyncio
    async def test_readiness_check_not_ready_llm(self):
        """Test readiness check - LLM fail"""
        mock_db = AsyncMock()
        
        with patch("app.api.health.unified_client") as mock_client:
            mock_client._initialized = False # Not ready
            
            response = await readiness_check(mock_db)
            
            assert response.status_code == 503
            import json
            content = json.loads(response.body)
            assert content["status"] == "not_ready"

    @pytest.mark.asyncio
    async def test_liveness_check(self):
        """Test liveness check"""
        response = await liveness_check()
        assert response["status"] == "alive"
        assert "timestamp" in response
