"""
Unit Tests for HealthService
Tests health check functionality for various services
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from app.services.health_service import HealthService


class TestHealthServiceOverallHealth:
    """Test overall health check methods"""
    
    @pytest.mark.asyncio
    async def test_get_system_health(self, test_db):
        """Test getting overall system health"""
        service = HealthService(test_db)
        
        result = await service.get_system_health()
        
        assert result is not None
        assert "status" in result
        assert "services" in result
        assert result["status"] in ["healthy", "degraded", "critical"]
    
    @pytest.mark.asyncio
    async def test_get_system_health_has_timestamp(self, test_db):
        """Test that system health includes timestamp"""
        service = HealthService(test_db)
        
        result = await service.get_system_health()
        
        assert "timestamp" in result
        assert "response_time_ms" in result
    
    @pytest.mark.asyncio
    async def test_get_system_health_has_services(self, test_db):
        """Test that system health includes all services"""
        service = HealthService(test_db)
        
        result = await service.get_system_health()
        
        assert "services" in result
        services = result["services"]
        
        # Check expected services
        assert "database" in services
        assert "redis" in services
        assert "disk" in services
        assert "memory" in services
        assert "cpu" in services


class TestHealthServiceDatabaseCheck:
    """Test database health check methods"""
    
    @pytest.mark.asyncio
    async def test_check_database_health(self, test_db):
        """Test database health check"""
        service = HealthService(test_db)
        
        # Use private method directly
        result = await service._check_database()
        
        assert result is not None
        assert "status" in result
        assert result["status"] in ["healthy", "degraded", "critical"]
    
    @pytest.mark.asyncio
    async def test_check_database_latency(self, test_db):
        """Test database latency measurement"""
        service = HealthService(test_db)
        
        result = await service._check_database()
        
        if "response_time_ms" in result:
            assert isinstance(result["response_time_ms"], (int, float))
            assert result["response_time_ms"] >= 0


class TestHealthServiceRedisCheck:
    """Test Redis health check methods"""
    
    @pytest.mark.asyncio
    async def test_check_redis_health(self, test_db):
        """Test Redis health check"""
        service = HealthService(test_db)
        
        result = await service._check_redis()
        
        assert result is not None
        assert "status" in result
        # Redis may be unavailable in test environment
        assert result["status"] in ["healthy", "degraded", "critical"]


class TestHealthServiceResourceChecks:
    """Test resource health check methods"""
    
    def test_check_disk_health(self, test_db):
        """Test disk health check"""
        service = HealthService(test_db)
        
        result = service._check_disk()
        
        assert result is not None
        assert "status" in result
        assert result["status"] in ["healthy", "degraded", "critical"]
    
    def test_check_memory_health(self, test_db):
        """Test memory health check"""
        service = HealthService(test_db)
        
        result = service._check_memory()
        
        assert result is not None
        assert "status" in result
        assert result["status"] in ["healthy", "degraded", "critical"]
    
    def test_check_cpu_health(self, test_db):
        """Test CPU health check"""
        service = HealthService(test_db)
        
        result = service._check_cpu()
        
        assert result is not None
        assert "status" in result
        assert result["status"] in ["healthy", "degraded", "critical"]
